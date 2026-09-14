import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import CampaignException from '#exceptions/campaign_exception'
import { CampaignService } from '#services/campaign_service'
import { createCampaignValidator, scheduleCampaignValidator } from '#validators/campaign'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(timezone: string) {
  const id = randomUUID()
  const slug = `camp-utc-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign UTC ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone,
      currency: 'INR',
      status: 'active',
    })
    .returning(['id'])
  const organizationId = row.id as string
  const planId = randomUUID()
  await db.table('plans').insert({
    id: planId,
    code: `camp_utc_${organizationId.slice(0, 8)}`,
    name: `Campaign UTC Plan ${organizationId.slice(0, 8)}`,
    price: Number.parseInt(organizationId.replace(/-/g, '').slice(0, 8), 16) % 1_000_000_000,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: { maxBroadcastRecipients: 10000, campaignsPerMonth: 1000 },
    isActive: true,
    sortOrder: 1,
    metadata: {
      features: [{ key: 'scheduledCampaigns', enabled: true }],
    },
  })
  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: randomUUID(),
      organizationId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      cancelAtPeriodEnd: false,
      metadata: {},
    })
  })
  return organizationId
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

async function seedTemplateAndConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-utc-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-utc',
        accessToken: encryptWhatsappAccessToken('plain-token-utc'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const [template] = await db
      .table('message_templates')
      .insert({
        organizationId,
        whatsappConfigId: config.id,
        name: `hello_${randomUUID().slice(0, 6)}`,
        language: 'en_US',
        category: 'UTILITY',
        status: 'approved',
        bodyText: 'Hello',
        parameterSchema: {
          headerNames: [],
          bodyNames: [],
          sendable: true,
        },
      })
      .returning(['id'])

    return {
      whatsappConfigId: config.id as string,
      messageTemplateId: template.id as string,
    }
  })
}

async function seedRecipient(organizationId: string, campaignId: string) {
  await runWithTenant(organizationId, async () => {
    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'UTC Contact',
        customFields: {},
      })
      .returning(['id'])

    await new CampaignService().replaceRecipients({
      organizationId,
      campaignId,
      contactIds: [contact.id as string],
    })
  })
}

test.group('Campaign scheduledAt UTC contract', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('message_templates').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
        await db.from('usage_meters').where('organizationId', organizationId).delete()
        await db.from('organization_subscriptions').where('organizationId', organizationId).delete()
      })
      await db
        .from('plans')
        .whereILike('code', `camp_utc_${organizationId.slice(0, 8)}%`)
        .delete()
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('create is draft-only and ignores organization timezone for scheduling', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Draft only',
    })

    assert.equal(created.status, 'draft')
    assert.isNull(created.scheduledAt)
  })

  test('schedule persists 16:00 UTC regardless of organization timezone', async ({ assert }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const seeded = await seedTemplateAndConfig(organizationId)
    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'UTC schedule',
      messageTemplateId: seeded.messageTemplateId,
      whatsappConfigId: seeded.whatsappConfigId,
    })
    await seedRecipient(organizationId, created.id)

    const scheduled = await service.scheduleCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19T16:00:00.000Z',
    })

    assert.equal(scheduled.status, 'scheduled')
    assert.equal(scheduled.scheduledAt, '2099-08-19T16:00:00.000Z')

    const fetched = await service.getCampaignById({
      campaignId: created.id,
      organizationId,
    })
    assert.equal(fetched.scheduledAt, '2099-08-19T16:00:00.000Z')
  })

  test('schedule rejects naive and offset payloads', async ({ assert }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const seeded = await seedTemplateAndConfig(organizationId)
    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Reject non-Z',
      messageTemplateId: seeded.messageTemplateId,
      whatsappConfigId: seeded.whatsappConfigId,
    })
    await seedRecipient(organizationId, created.id)

    try {
      await service.scheduleCampaign({
        campaignId: created.id,
        organizationId,
        scheduledAt: '2099-08-19 16:00:00',
      })
      assert.fail('expected naive schedule to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
    }

    try {
      await service.scheduleCampaign({
        campaignId: created.id,
        organizationId,
        scheduledAt: '2099-08-19T16:00:00+05:30',
      })
      assert.fail('expected offset schedule to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
    }
  })

  test('update and recipients reject scheduled campaigns', async ({ assert }) => {
    const organizationId = await createOrg('UTC')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const seeded = await seedTemplateAndConfig(organizationId)
    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Frozen when scheduled',
      messageTemplateId: seeded.messageTemplateId,
      whatsappConfigId: seeded.whatsappConfigId,
    })
    await seedRecipient(organizationId, created.id)

    await service.scheduleCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19T16:00:00.000Z',
    })

    try {
      await service.updateCampaign({
        campaignId: created.id,
        organizationId,
        name: 'Should fail',
      })
      assert.fail('expected update to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
    }

    try {
      await service.replaceRecipients({
        organizationId,
        campaignId: created.id,
        contactIds: [],
      })
      assert.fail('expected replaceRecipients to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
    }
  })

  test('send rejects scheduled campaigns and accepts drafts', async ({ assert }) => {
    const organizationId = await createOrg('UTC')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const seeded = await seedTemplateAndConfig(organizationId)
    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Send draft only',
      messageTemplateId: seeded.messageTemplateId,
      whatsappConfigId: seeded.whatsappConfigId,
    })
    await seedRecipient(organizationId, created.id)

    await service.scheduleCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19T16:00:00.000Z',
    })

    try {
      await service.sendCampaign({
        campaignId: created.id,
        organizationId,
      })
      assert.fail('expected send on scheduled to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
    }

    await service.cancelScheduledCampaign({
      campaignId: created.id,
      organizationId,
    })

    const sent = await service.sendCampaign({
      campaignId: created.id,
      organizationId,
    })
    assert.equal(sent.status, 'sending')
  })

  test('validators accept only Z instants for schedule and draft-only create', async ({
    assert,
  }) => {
    const created = await createCampaignValidator.validate({
      name: 'Draft',
    })
    assert.equal(created.name, 'Draft')
    assert.isUndefined((created as { scheduledAt?: string }).scheduledAt)

    const iso = await scheduleCampaignValidator.validate({
      scheduledAt: '2099-08-19T16:00:00.000Z',
    })
    assert.equal(iso.scheduledAt, '2099-08-19T16:00:00.000Z')

    await assert.rejects(() =>
      scheduleCampaignValidator.validate({
        scheduledAt: '2099-08-19 16:00:00',
      })
    )

    await assert.rejects(() =>
      scheduleCampaignValidator.validate({
        scheduledAt: '2099-08-19T16:00:00+00:00',
      })
    )

    const withStrayZone = await scheduleCampaignValidator.validate({
      scheduledAt: '2099-08-19T16:00:00.000Z',
      timeZone: 'Asia/Kolkata',
    })
    assert.equal(withStrayZone.scheduledAt, '2099-08-19T16:00:00.000Z')
    assert.isUndefined((withStrayZone as { timeZone?: string }).timeZone)
  })
})
