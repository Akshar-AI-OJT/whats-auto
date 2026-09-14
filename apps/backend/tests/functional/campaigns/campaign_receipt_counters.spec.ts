import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { CampaignRecipientDispatchService } from '#services/campaigns/campaign_recipient_dispatch_service'
import { CampaignService } from '#services/campaign_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-rcpt-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Receipts ${slug}`,
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

async function seedCampaignFixture(organizationId: string, userId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-rcpt-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-rcpt',
        accessToken: encryptWhatsappAccessToken('plain-token-rcpt'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Receipt Contact',
        customFields: {},
      })
      .returning(['id'])

    const campaign = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Receipt campaign',
    })

    await new CampaignService().replaceRecipients({
      organizationId,
      campaignId: campaign.id,
      contactIds: [contact.id as string],
    })

    const [conversation] = await db
      .table('conversations')
      .insert({
        organizationId,
        whatsappConfigId: config.id,
        contactId: contact.id,
        status: 'open',
      })
      .returning(['id'])

    const [message] = await db
      .table('messages')
      .insert({
        organizationId,
        conversationId: conversation.id,
        senderType: 'system',
        senderId: null,
        contentType: 'template',
        contentText: 'hello',
        status: 'queued',
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      })
      .returning(['id'])

    await db
      .from('broadcast_recipients')
      .where('broadcastId', campaign.id)
      .where('organizationId', organizationId)
      .update({
        status: 'queued',
        messageId: message.id,
      })

    return {
      campaignId: campaign.id,
      messageId: message.id as string,
    }
  })
}

async function loadBroadcast(organizationId: string, campaignId: string) {
  return runWithTenant(organizationId, async () => {
    return db.from('broadcasts').where('id', campaignId).first()
  })
}

async function loadRecipient(organizationId: string, campaignId: string) {
  return runWithTenant(organizationId, async () => {
    return db.from('broadcast_recipients').where('broadcastId', campaignId).first()
  })
}

test.group('CampaignRecipientDispatchService.applyProviderReceipt', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('messages').where('organizationId', organizationId).delete()
        await db.from('conversations').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('first delivered stamps deliveredAt and increments deliveredCount once', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const fixture = await seedCampaignFixture(organizationId, userId)
    const service = new CampaignRecipientDispatchService()
    const at = new Date('2026-09-13T10:00:00.000Z')

    await runWithTenant(organizationId, async () => {
      const first = await service.applyProviderReceipt({
        organizationId,
        messageId: fixture.messageId,
        status: 'delivered',
        providerStatusAt: at,
      })
      const retry = await service.applyProviderReceipt({
        organizationId,
        messageId: fixture.messageId,
        status: 'delivered',
        providerStatusAt: new Date('2026-09-13T10:01:00.000Z'),
      })
      assert.isTrue(first)
      assert.isFalse(retry)
    })

    const campaign = await loadBroadcast(organizationId, fixture.campaignId)
    const recipient = await loadRecipient(organizationId, fixture.campaignId)
    assert.equal(Number(campaign.sentCount), 1)
    assert.equal(Number(campaign.deliveredCount), 1)
    assert.equal(Number(campaign.readCount), 0)
    assert.equal(recipient.status, 'delivered')
    assert.isNotNull(recipient.deliveredAt)
    assert.isNotNull(recipient.sentAt)
  })

  test('read with no prior delivered fills delivered and read counters', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const fixture = await seedCampaignFixture(organizationId, userId)
    const service = new CampaignRecipientDispatchService()

    await runWithTenant(organizationId, async () => {
      await service.applyProviderReceipt({
        organizationId,
        messageId: fixture.messageId,
        status: 'read',
        providerStatusAt: new Date('2026-09-13T10:00:00.000Z'),
      })
    })

    const campaign = await loadBroadcast(organizationId, fixture.campaignId)
    const recipient = await loadRecipient(organizationId, fixture.campaignId)
    assert.equal(Number(campaign.sentCount), 1)
    assert.equal(Number(campaign.deliveredCount), 1)
    assert.equal(Number(campaign.readCount), 1)
    assert.equal(recipient.status, 'read')
    assert.isNotNull(recipient.sentAt)
    assert.isNotNull(recipient.deliveredAt)
    assert.isNotNull(recipient.readAt)
  })

  test('non-campaign messageId is a no-op', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const fixture = await seedCampaignFixture(organizationId, userId)
    const service = new CampaignRecipientDispatchService()

    const applied = await runWithTenant(organizationId, async () => {
      return service.applyProviderReceipt({
        organizationId,
        messageId: randomUUID(),
        status: 'delivered',
        providerStatusAt: new Date(),
      })
    })
    assert.isFalse(applied)

    const campaign = await loadBroadcast(organizationId, fixture.campaignId)
    assert.equal(Number(campaign.deliveredCount), 0)
    assert.equal(Number(campaign.sentCount), 0)
  })

  test('failed from queued increments failedCount; failed after sent does not', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const queued = await seedCampaignFixture(organizationId, userId)
    const sent = await seedCampaignFixture(organizationId, userId)
    const service = new CampaignRecipientDispatchService()

    await runWithTenant(organizationId, async () => {
      await service.applyProviderReceipt({
        organizationId,
        messageId: queued.messageId,
        status: 'failed',
        providerStatusAt: new Date(),
        errorMessage: 'Meta rejected',
      })
      await service.applyProviderReceipt({
        organizationId,
        messageId: sent.messageId,
        status: 'sent',
        providerStatusAt: new Date(),
      })
      await service.applyProviderReceipt({
        organizationId,
        messageId: sent.messageId,
        status: 'failed',
        providerStatusAt: new Date(),
        errorMessage: 'Later failure',
      })
    })

    const queuedCampaign = await loadBroadcast(organizationId, queued.campaignId)
    const queuedRecipient = await loadRecipient(organizationId, queued.campaignId)
    assert.equal(Number(queuedCampaign.failedCount), 1)
    assert.equal(Number(queuedCampaign.sentCount), 0)
    assert.equal(queuedRecipient.status, 'failed')
    assert.equal(queuedRecipient.errorMessage, 'Meta rejected')

    const sentCampaign = await loadBroadcast(organizationId, sent.campaignId)
    const sentRecipient = await loadRecipient(organizationId, sent.campaignId)
    assert.equal(Number(sentCampaign.sentCount), 1)
    assert.equal(Number(sentCampaign.failedCount), 0)
    assert.equal(sentRecipient.status, 'sent')
    assert.equal(sentRecipient.errorMessage, 'Later failure')
  })

  test('recomputeCounters rebuilds counts from recipient timestamps', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const fixture = await seedCampaignFixture(organizationId, userId)
    const service = new CampaignRecipientDispatchService()

    await runWithTenant(organizationId, async () => {
      await service.applyProviderReceipt({
        organizationId,
        messageId: fixture.messageId,
        status: 'read',
        providerStatusAt: new Date('2026-09-13T10:00:00.000Z'),
      })
      await db.from('broadcasts').where('id', fixture.campaignId).update({
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
      })
      await service.recomputeCounters({
        organizationId,
        campaignId: fixture.campaignId,
      })
    })

    const campaign = await loadBroadcast(organizationId, fixture.campaignId)
    assert.equal(Number(campaign.sentCount), 1)
    assert.equal(Number(campaign.deliveredCount), 1)
    assert.equal(Number(campaign.readCount), 1)
  })
})
