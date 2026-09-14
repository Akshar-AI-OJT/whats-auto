import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { MessageService } from '#services/message_service'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `inbox-out-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Inbox Out ${slug}`,
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

async function seedOpenConversation(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-inbox-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-inbox',
        accessToken: encryptWhatsappAccessToken('plain-token-inbox'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const phone = '15559876543'
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Inbox Contact',
        customFields: {},
      })
      .returning(['id'])

    const [conversation] = await db
      .table('conversations')
      .insert({
        organizationId,
        whatsappConfigId: config.id,
        contactId: contact.id,
        status: 'open',
        unreadCount: 0,
      })
      .returning(['id'])

    await db.table('messages').insert({
      organizationId,
      conversationId: conversation.id,
      senderType: 'contact',
      senderId: null,
      contentType: 'text',
      contentText: 'hi from contact',
      status: 'delivered',
      occurredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    })

    return { conversationId: conversation.id as string }
  })
}

function fakeGraph(): MetaGraphClient {
  return {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'x' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async () => ({ id: '1' }),
    sendTextMessage: async () => ({ messageId: 'wamid.inbox.text', raw: {} }),
    sendTemplateMessage: async () => ({ messageId: 'wamid.inbox.tpl', raw: {} }),
    sendMediaMessage: async () => ({ messageId: 'wamid.inbox.media', raw: {} }),
  } as MetaGraphClient
}

test.group('MessageService outbound integration', (group) => {
  const orgIds: string[] = []

  group.each.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    const driver = await manager.ensureStarted()
    if (driver instanceof NullJobQueueDriver) {
      driver.clearEnqueued()
    }
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await runWithTenant(organizationId, async () => {
          await db.from('organizations').where('id', organizationId).delete()
        })
      }
    }
  })

  test('sendAgentReply queues text and returns status queued without providerMessageId', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedOpenConversation(organizationId)
    const agentId = randomUUID()
    await db.table('users').insert({
      id: agentId,
      name: 'Ada',
      firstname: 'Ada',
      lastname: 'Lovelace',
      email: `ada-${agentId.slice(0, 8)}@example.com`,
      emailVerified: true,
    })

    const outbound = new WhatsappOutboundService(fakeGraph())
    const service = new MessageService(outbound)

    const message = await service.sendAgentReply({
      organizationId,
      conversationId: seeded.conversationId,
      senderId: agentId,
      contentType: 'text',
      contentText: 'Agent reply',
      idempotencyKey: `key-${randomUUID()}`,
    })

    assert.equal(message.status, 'queued')
    assert.equal(message.contentType, 'text')
    assert.equal(message.contentText, 'Agent reply')
    assert.isNull(message.providerMessageId)
  })
})

test.group('Inbox messages HTTP auth', () => {
  test('unauthorized agent cannot reply without auth', async ({ client }) => {
    const response = await client
      .post(`/api/v1/inbox/conversations/${randomUUID()}/messages`)
      .json({ contentType: 'text', contentText: 'hi' })
      .header('Idempotency-Key', randomUUID())

    response.assertStatus(401)
  })
})
