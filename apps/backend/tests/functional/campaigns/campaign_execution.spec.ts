import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { CampaignService } from '#services/campaign_service'
import { CampaignExecutionService } from '#services/campaign_execution_service'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign ${slug}`,
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

async function seedTemplateAndConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-camp-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-camp',
        accessToken: encryptWhatsappAccessToken('plain-token-camp'),
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
        bodyText: 'Hello {{name}}',
        parameterSchema: {
          headerNames: [],
          bodyNames: ['name'],
          sendable: true,
        },
      })
      .returning(['id'])

    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Campaign Contact',
        customFields: {},
      })
      .returning(['id'])

    return {
      whatsappConfigId: config.id as string,
      messageTemplateId: template.id as string,
      contactId: contact.id as string,
    }
  })
}

function fakeGraph(): MetaGraphClient {
  return {
    sendTextMessage: async () => ({ messageId: `wamid.${randomUUID()}`, raw: {} }),
    sendTemplateMessage: async () => ({ messageId: `wamid.${randomUUID()}`, raw: {} }),
    sendMediaMessage: async () => ({ messageId: `wamid.${randomUUID()}`, raw: {} }),
  } as unknown as MetaGraphClient
}

function makeCampaignServices(outbound?: WhatsappOutboundService) {
  const mediaReferences = new MediaAssetReferenceRepository()
  const campaigns = new CampaignService(mediaReferences)
  const execution = new CampaignExecutionService(
    campaigns,
    outbound ?? new WhatsappOutboundService(fakeGraph()),
    new WhatsappWebhookRepository(),
    mediaReferences
  )
  return { campaigns, execution }
}

test.group('CampaignExecutionService', (group) => {
  const orgIds: string[] = []

  group.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    const driver = await manager.ensureStarted()
    if (driver instanceof NullJobQueueDriver) {
      driver.clearEnqueued()
    }
  })

  group.each.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    const driver = await manager.ensureStarted()
    if (driver instanceof NullJobQueueDriver) {
      driver.clearEnqueued()
    }
  })

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('outbound_dispatches').where('organizationId', organizationId).delete()
        await db.from('messages').where('organizationId', organizationId).delete()
        await db.from('conversations').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('message_templates').where('organizationId', organizationId).delete()
        await db.from('contact_tags').where('organizationId', organizationId).delete()
        await db.from('tags').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
        await db.from('media_asset_references').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
  })

  test('schedules campaign, executes recipients, and finalizes', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)

    const outbound = new WhatsappOutboundService(fakeGraph())
    const { campaigns, execution } = makeCampaignServices(outbound)

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Phase 3 Launch',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
      variables: { name: 'Ada' },
    })

    const scheduled = await execution.scheduleCampaign({
      organizationId,
      campaignId: campaign.id,
      scheduledAt: new Date(Date.now() - 1000),
    })
    assert.equal(scheduled.status, 'sending')

    const result = await execution.executeCampaign({
      organizationId,
      campaignId: campaign.id,
    })
    assert.equal(result.claimed, 1)
    assert.equal(result.remaining, 0)
    assert.isTrue(result.finalized)

    await runWithTenant(organizationId, async () => {
      const row = await db.from('broadcasts').where('id', campaign.id).first()
      const recipient = await db
        .from('broadcast_recipients')
        .where('broadcastId', campaign.id)
        .first()
      assert.equal(row.status, 'sent')
      assert.isNotNull(row.finalizedAt)
      assert.equal(recipient.status, 'queued')
      assert.isNotNull(recipient.messageId)
    })
  })

  test('cancel scheduled campaign reverts to draft', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns, execution } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Cancel me',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
    })

    await execution.scheduleCampaign({
      organizationId,
      campaignId: campaign.id,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const cancelled = await execution.cancelCampaign({
      organizationId,
      campaignId: campaign.id,
    })
    assert.equal(cancelled.status, 'draft')
    assert.isNull(cancelled.scheduledAt)
  })

  test('CampaignService.scheduleCampaign rejects unapproved template', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns, execution } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Unapproved template',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('message_templates')
        .where('id', seeded.messageTemplateId)
        .update({ status: 'pending' })
    })

    try {
      await campaigns.scheduleCampaign({
        campaignId: campaign.id,
        organizationId,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      assert.fail('expected scheduleCampaign to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_TEMPLATE_NOT_APPROVED')
    }

    const still = await campaigns.getCampaignById({ campaignId: campaign.id, organizationId })
    assert.equal(still.status, 'draft')
  })

  test('CampaignService.sendCampaign rejects disconnected WhatsApp config', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns, execution } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Disconnected WA',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('whatsapp_configs')
        .where('id', seeded.whatsappConfigId)
        .update({ status: 'disconnected' })
    })

    try {
      await campaigns.sendCampaign({
        campaignId: campaign.id,
        organizationId,
      })
      assert.fail('expected sendCampaign to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_WA_CONFIG_NOT_CONNECTED')
    }

    const still = await campaigns.getCampaignById({ campaignId: campaign.id, organizationId })
    assert.equal(still.status, 'draft')
  })

  test('schedule enqueue failure compensates status back to draft', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns, execution } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Enqueue fail',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
    })

    const manager = await app.container.make(JobQueueManager)
    const driver = await manager.ensureStarted()
    assert.instanceOf(driver, NullJobQueueDriver)
    const original = driver.enqueue.bind(driver)
    driver.enqueue = async () => {
      throw new Error('queue unavailable')
    }

    try {
      await assert.rejects(() =>
        campaigns.scheduleCampaign({
          campaignId: campaign.id,
          organizationId,
          scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        })
      )
    } finally {
      driver.enqueue = original
    }

    const still = await campaigns.getCampaignById({ campaignId: campaign.id, organizationId })
    assert.equal(still.status, 'draft')
    assert.isNull(still.scheduledAt)
  })

  test('changeCampaignStatus rejects terminal to draft', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Already sent',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await runWithTenant(organizationId, async () => {
      await db.from('broadcasts').where('id', campaign.id).update({ status: 'sent' })
    })

    try {
      await campaigns.changeCampaignStatus({
        campaignId: campaign.id,
        organizationId,
        status: 'draft',
      })
      assert.fail('expected changeCampaignStatus to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_INVALID_STATUS_TRANSITION')
    }
  })

  test('executeCampaign fails fast when template is not approved', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    const seeded = await seedTemplateAndConfig(organizationId)
    const { campaigns, execution } = makeCampaignServices()

    const campaign = await campaigns.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Execute unapproved',
      whatsappConfigId: seeded.whatsappConfigId,
      messageTemplateId: seeded.messageTemplateId,
      status: 'draft',
    })

    await execution.replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [seeded.contactId],
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('message_templates')
        .where('id', seeded.messageTemplateId)
        .update({ status: 'pending' })
      await db.from('broadcasts').where('id', campaign.id).update({ status: 'sending' })
    })

    const result = await execution.executeCampaign({
      organizationId,
      campaignId: campaign.id,
    })
    assert.equal(result.claimed, 0)
    assert.isTrue(result.finalized)

    await runWithTenant(organizationId, async () => {
      const row = await db.from('broadcasts').where('id', campaign.id).first()
      const pending = await db
        .from('broadcast_recipients')
        .where('broadcastId', campaign.id)
        .where('status', 'pending')
        .count('* as total')
        .first()
      assert.equal(row.status, 'failed')
      assert.equal(Number(pending?.total ?? 0), 1)
    })
  })
})
