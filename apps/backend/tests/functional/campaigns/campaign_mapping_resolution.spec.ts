import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { CampaignService } from '#services/campaign_service'
import { runWithTenant } from '#services/tenant_context'
import type { CampaignVariableMappings } from '#validators/campaign'

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-map-res-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Map Resolve ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: 'active',
    })
    .returning(['id'])
  return row.id as string
}

async function seedUser() {
  const id = randomUUID()
  await db.table('users').insert({
    id,
    name: 'Campaign Owner',
    firstname: 'Campaign',
    lastname: 'Owner',
    email: `owner-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function seedContact(
  organizationId: string,
  opts?: {
    name?: string | null
    customFields?: Record<string, unknown>
  }
) {
  return runWithTenant(organizationId, async () => {
    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: opts?.name === undefined ? 'Recipient Contact' : opts.name,
        customFields: opts?.customFields ?? {},
      })
      .returning(['id'])
    return contact.id as string
  })
}

async function seedTemplate(
  organizationId: string,
  opts?: {
    bodyText?: string
    parameterSchema?: Record<string, unknown>
  }
) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId,
        name: `tpl_${randomUUID().slice(0, 8)}`,
        category: 'UTILITY',
        language: 'en_US',
        headerType: 'none',
        bodyText: opts?.bodyText ?? 'Hello {{customer_name}}',
        parameterSchema: opts?.parameterSchema ?? {
          headerNames: [],
          bodyNames: ['customer_name'],
          sendable: true,
        },
        status: 'approved',
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedWhatsappConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-map-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-map',
        accessToken: 'test-token',
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

test.group('Campaign variableMappings recipient resolution', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('contact_tags').where('organizationId', organizationId).delete()
        await db.from('tags').where('organizationId', organizationId).delete()
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('message_templates').where('organizationId', organizationId).delete()
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('A. contact_field mapping resolves name into customer_name', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId)
    const contactId = await seedContact(organizationId, { name: 'John Doe' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Contact field map',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, { customer_name: 'John Doe' })
  })

  test('B. custom_field mapping resolves order_id', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Order {{order_id}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['order_id'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, {
      name: 'John Doe',
      customFields: { order_id: 'ORD-123' },
    })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Custom field map',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          order_id: { source: 'custom_field', field: 'order_id' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, { order_id: 'ORD-123' })
  })

  test('C. static mapping applies the same value to every recipient', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Code {{promo_code}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['promo_code'],
        sendable: true,
      },
    })
    const first = await seedContact(organizationId, { name: 'Ada' })
    const second = await seedContact(organizationId, { name: 'Priya' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Static map',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          promo_code: { source: 'static', value: 'SUMMER26' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [first, second],
      })
    )

    const rows = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).select('variables')
    )
    assert.lengthOf(rows, 2)
    for (const row of rows) {
      assert.deepEqual(row.variables, { promo_code: 'SUMMER26' })
    }
  })

  test('D. contact, custom, and static mappings resolve together', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hi {{customer_name}}, order {{order_id}}, code {{promo_code}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['customer_name', 'order_id', 'promo_code'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, {
      name: 'John Doe',
      customFields: { order_id: 'ORD-123' },
    })
    const mappings: CampaignVariableMappings = {
      customer_name: { source: 'contact_field', field: 'name' },
      order_id: { source: 'custom_field', field: 'order_id' },
      promo_code: { source: 'static', value: 'SUMMER26' },
    }

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Combined maps',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: mappings,
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, {
      customer_name: 'John Doe',
      order_id: 'ORD-123',
      promo_code: 'SUMMER26',
    })
  })

  test('E. campaigns without variableMappings still use automatic same-key resolution for name', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hello {{name}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['name'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, { name: 'John Doe' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'No mappings auto',
        messageTemplateId: templateId,
        status: 'draft',
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, { name: 'John Doe' })
  })

  test('F. request-level variables override mapped and automatic values', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hi {{customer_name}}, code {{otp}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['customer_name', 'otp'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, {
      name: 'John Doe',
      customFields: { otp: '123456' },
    })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Request override',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
        variables: { customer_name: 'Guest' },
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, { customer_name: 'Guest', otp: '123456' })
  })

  test('G. missing mapped required value returns existing missing-parameter error', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Order {{order_id}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['order_id'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, {
      name: 'John Doe',
      customFields: {},
    })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Missing mapped',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          order_id: { source: 'custom_field', field: 'order_id' },
        },
      })
    )

    try {
      await runWithTenant(organizationId, () =>
        new CampaignService().replaceRecipients({
          organizationId,
          campaignId: campaign.id,
          contactIds: [contactId],
        })
      )
      assert.fail('expected missing template parameters')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_MISSING_TEMPLATE_PARAMETERS')
    }

    const recipients = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id)
    )
    assert.lengthOf(recipients, 0)
  })

  test('H. each recipient gets contact-specific mapped values and the same static value', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hi {{customer_name}}, code {{promo_code}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['customer_name', 'promo_code'],
        sendable: true,
      },
    })
    const ada = await seedContact(organizationId, { name: 'Ada' })
    const priya = await seedContact(organizationId, { name: 'Priya' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Per recipient maps',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
          promo_code: { source: 'static', value: 'SUMMER26' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [ada, priya],
      })
    )

    const rows = await runWithTenant(organizationId, () =>
      db
        .from('broadcast_recipients')
        .where('broadcastId', campaign.id)
        .select('contactId', 'variables')
    )
    const byContact = new Map(rows.map((row) => [row.contactId as string, row.variables]))
    assert.deepEqual(byContact.get(ada), { customer_name: 'Ada', promo_code: 'SUMMER26' })
    assert.deepEqual(byContact.get(priya), { customer_name: 'Priya', promo_code: 'SUMMER26' })
  })

  test('I. tagId audience resolves mappings for tagged contacts', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hi {{customer_name}}, code {{promo_code}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['customer_name', 'promo_code'],
        sendable: true,
      },
    })
    const liveA = await seedContact(organizationId, { name: 'Ada' })
    const liveB = await seedContact(organizationId, { name: 'Priya' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Tag mapped',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
          promo_code: { source: 'static', value: 'SUMMER26' },
        },
      })
    )

    const tagId = await runWithTenant(organizationId, async () => {
      const [tag] = await db
        .table('tags')
        .insert({ organizationId, createdByUserId: userId, name: 'VIP' })
        .returning(['id'])
      await db.table('contact_tags').insert([
        { organizationId, tagId: tag.id, contactId: liveA },
        { organizationId, tagId: tag.id, contactId: liveB },
      ])
      return tag.id as string
    })

    const updated = await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        tagId,
      })
    )
    assert.equal(updated.totalRecipients, 2)

    const rows = await runWithTenant(organizationId, () =>
      db
        .from('broadcast_recipients')
        .where('broadcastId', campaign.id)
        .select('contactId', 'variables')
    )
    const byContact = new Map(rows.map((row) => [row.contactId as string, row.variables]))
    assert.deepEqual(byContact.get(liveA), { customer_name: 'Ada', promo_code: 'SUMMER26' })
    assert.deepEqual(byContact.get(liveB), { customer_name: 'Priya', promo_code: 'SUMMER26' })
  })

  test('replaceRecipients rematerializes using latest mappings; PATCH does not rewrite rows', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId)
    const contactId = await seedContact(organizationId, { name: 'John Doe' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Rematerialize',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().updateCampaign({
        campaignId: campaign.id,
        organizationId,
        variableMappings: {
          customer_name: { source: 'static', value: 'SUMMER26' },
        },
      })
    )

    const beforeResnapshot = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(beforeResnapshot.variables, { customer_name: 'John Doe' })

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const afterResnapshot = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(afterResnapshot.variables, { customer_name: 'SUMMER26' })
  })

  test('J. contact_field name mapping uses Customer when contact name is empty', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId)
    const contactId = await seedContact(organizationId, { name: null })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Empty name fallback',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const row = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id).first()
    )
    assert.deepEqual(row.variables, { customer_name: 'Customer' })
  })

  test('K. sendCampaign preflight passes when contact name is empty and mapped to name', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const whatsappConfigId = await seedWhatsappConfig(organizationId)
    const templateId = await seedTemplate(organizationId)
    const contactId = await seedContact(organizationId, { name: null })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Send empty name fallback',
        messageTemplateId: templateId,
        whatsappConfigId,
        status: 'draft',
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'name' },
        },
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const sent = await runWithTenant(organizationId, () =>
      new CampaignService().sendCampaign({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.equal(sent.status, 'sending')
  })
})
