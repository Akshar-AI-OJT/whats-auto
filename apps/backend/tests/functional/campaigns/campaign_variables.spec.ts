import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { CampaignService } from '#services/campaign_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-var-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Vars ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: true,
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
        phoneNumberId: `pn-var-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-var',
        accessToken: 'test-token',
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

test.group('Campaign template variables', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
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

  test('replaceRecipients resolves contact fields per recipient', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId)
    const ada = await seedContact(organizationId, { name: 'Ada' })
    const priya = await seedContact(organizationId, { name: 'Priya' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Named vars',
        messageTemplateId: templateId,
        status: 'draft',
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
        .orderBy('contactId', 'asc')
        .select('contactId', 'variables')
    )

    const byContact = new Map(rows.map((row) => [row.contactId as string, row.variables]))
    assert.deepEqual(byContact.get(ada), { customer_name: 'Ada' })
    assert.deepEqual(byContact.get(priya), { customer_name: 'Priya' })
  })

  test('explicit variables override contact fields and customFields fill params', async ({
    assert,
  }) => {
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
      name: 'Ada',
      customFields: { otp: '123456' },
    })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Overrides',
        messageTemplateId: templateId,
        status: 'draft',
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

  test('replaceRecipients fails when a required variable cannot be resolved', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Your code is {{otp}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['otp'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, { name: 'Ada' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Missing otp',
        messageTemplateId: templateId,
        status: 'draft',
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

  test('templates without variables snapshot without parameter values', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'We are open tomorrow.',
      parameterSchema: { headerNames: [], bodyNames: [], sendable: true },
    })
    const contactId = await seedContact(organizationId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'No vars',
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
    assert.deepEqual(row.variables, {})
  })

  test('numbered placeholders are sendable with positional schema', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Hi {{1}}, your order {{2}} has shipped.',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['1', '2'],
        sendable: true,
        parameterFormat: 'positional',
      },
    })
    const contactId = await seedContact(organizationId, { name: 'Ada Lovelace' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Numbered',
        messageTemplateId: templateId,
        status: 'draft',
        variableMappings: {
          '1': { source: 'contact_field', field: 'name' },
          '2': { source: 'static', value: 'NS-1001' },
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
    assert.deepEqual(row.variables, { '1': 'Ada Lovelace', '2': 'NS-1001' })
  })

  test('sendCampaign fails when required variables are still missing', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const whatsappConfigId = await seedWhatsappConfig(organizationId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'Your code is {{otp}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['otp'],
        sendable: true,
      },
    })
    const contactId = await seedContact(organizationId, { name: 'Ada' })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Send missing',
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

    await runWithTenant(organizationId, () =>
      new CampaignService().updateCampaign({
        campaignId: campaign.id,
        organizationId,
        messageTemplateId: templateId,
        whatsappConfigId,
      })
    )

    try {
      await runWithTenant(organizationId, () =>
        new CampaignService().sendCampaign({
          campaignId: campaign.id,
          organizationId,
        })
      )
      assert.fail('expected send to reject missing parameters')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_MISSING_TEMPLATE_PARAMETERS')
    }

    const still = await runWithTenant(organizationId, () =>
      new CampaignService().getCampaignById({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.equal(still.status, 'draft')
  })

  test('sendCampaign allows templates that have no variables', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const whatsappConfigId = await seedWhatsappConfig(organizationId)
    const templateId = await seedTemplate(organizationId, {
      bodyText: 'We are open tomorrow.',
      parameterSchema: { headerNames: [], bodyNames: [], sendable: true },
    })
    const contactId = await seedContact(organizationId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Send no vars',
        messageTemplateId: templateId,
        whatsappConfigId,
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

    const sent = await runWithTenant(organizationId, () =>
      new CampaignService().sendCampaign({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.equal(sent.status, 'sending')
  })
})
