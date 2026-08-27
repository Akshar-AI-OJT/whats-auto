import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { signMetaWebhookPayload } from '#lib/meta_whatsapp/webhook_signature'
import { runWithTenant } from '#services/tenant_context'

const REPLY_UNIX = 1_700_000_000

async function createOrg() {
  const id = randomUUID()
  const slug = `attr-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Attr ${slug}`,
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

async function seedCampaignThread(params: {
  sentAt: Date
  outboundWamid: string
  contactWaId: string
  phoneNumberId: string
}) {
  const organizationId = await createOrg()

  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: params.phoneNumberId,
        wabaId: 'waba-attr',
        accessToken: encryptWhatsappAccessToken('plain-token-test'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone: params.contactWaId,
        phoneNormalized: params.contactWaId.replace(/\D/g, ''),
        name: 'Campaign Contact',
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

    const [broadcast] = await db
      .table('broadcasts')
      .insert({
        organizationId,
        name: 'July launch',
        status: 'sent',
        repliedCount: 0,
      })
      .returning(['id'])

    const [message] = await db
      .table('messages')
      .insert({
        organizationId,
        conversationId: conversation.id,
        senderType: 'system',
        contentType: 'template',
        contentText: 'campaign',
        providerMessageId: params.outboundWamid,
        status: 'sent',
        sentAt: params.sentAt,
        metadata: {},
      })
      .returning(['id'])

    const [recipient] = await db
      .table('broadcast_recipients')
      .insert({
        organizationId,
        broadcastId: broadcast.id,
        contactId: contact.id,
        status: 'sent',
        messageId: message.id,
        sentAt: params.sentAt,
      })
      .returning(['id'])

    return {
      organizationId,
      phoneNumberId: params.phoneNumberId,
      contactWaId: params.contactWaId,
      conversationId: conversation.id as string,
      broadcastId: broadcast.id as string,
      recipientId: recipient.id as string,
    }
  })
}

function signedInbound(params: {
  phoneNumberId: string
  contactWaId: string
  inboundId: string
  body: string
  type?: 'text' | 'interactive'
  contextId?: string
}) {
  const message: Record<string, unknown> = {
    from: params.contactWaId,
    id: params.inboundId,
    timestamp: String(REPLY_UNIX),
    type: params.type ?? 'text',
  }
  if (params.type === 'interactive') {
    message.interactive = {
      type: 'button_reply',
      button_reply: { id: 'yes', title: params.body },
    }
  } else {
    message.text = { body: params.body }
  }
  if (params.contextId) {
    message.context = { id: params.contextId, from: '15550001111' }
  }

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: params.phoneNumberId,
              },
              contacts: [{ wa_id: params.contactWaId, profile: { name: 'Ada' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  }
  const rawBody = JSON.stringify(payload)
  return {
    payload,
    signature: signMetaWebhookPayload(rawBody, env.get('META_APP_SECRET').release()),
  }
}

async function readAttribution(
  organizationId: string,
  conversationId: string,
  broadcastId: string
) {
  return runWithTenant(organizationId, async () => {
    const conversation = await db.from('conversations').where('id', conversationId).first()
    const broadcast = await db.from('broadcasts').where('id', broadcastId).first()
    const recipient = await db
      .from('broadcast_recipients')
      .where('broadcastId', broadcastId)
      .first()
    return {
      attributedCampaignId: conversation?.attributedCampaignId as string | null,
      repliedCount: Number(broadcast?.repliedCount ?? 0),
      repliedAt: recipient?.repliedAt ?? null,
    }
  })
}

test.group('Campaign attribution', (group) => {
  const orgIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) {
        await runWithTenant(id, () => db.from('organizations').where('id', id).delete())
      }
    }
  })

  test('button reply with context.id attributes and counts once', async ({ client, assert }) => {
    const sentAt = new Date((REPLY_UNIX - 3600) * 1000)
    const seeded = await seedCampaignThread({
      sentAt,
      outboundWamid: 'wamid.out.btn',
      contactWaId: '15551110001',
      phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
    })
    orgIds.push(seeded.organizationId)

    const first = signedInbound({
      phoneNumberId: seeded.phoneNumberId,
      contactWaId: seeded.contactWaId,
      inboundId: 'wamid.in.btn.1',
      body: 'Yes',
      type: 'interactive',
      contextId: 'wamid.out.btn',
    })
    const firstResponse = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', first.signature)
      .json(first.payload)
    firstResponse.assertStatus(200)

    const afterFirst = await readAttribution(
      seeded.organizationId,
      seeded.conversationId,
      seeded.broadcastId
    )
    assert.equal(afterFirst.attributedCampaignId, seeded.broadcastId)
    assert.equal(afterFirst.repliedCount, 1)
    assert.isNotNull(afterFirst.repliedAt)

    const second = signedInbound({
      phoneNumberId: seeded.phoneNumberId,
      contactWaId: seeded.contactWaId,
      inboundId: 'wamid.in.btn.2',
      body: 'Yes again',
      type: 'interactive',
      contextId: 'wamid.out.btn',
    })
    const secondResponse = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', second.signature)
      .json(second.payload)
    secondResponse.assertStatus(200)

    const afterSecond = await readAttribution(
      seeded.organizationId,
      seeded.conversationId,
      seeded.broadcastId
    )
    assert.equal(afterSecond.attributedCampaignId, seeded.broadcastId)
    assert.equal(afterSecond.repliedCount, 1)
  })

  test('free-text within the window attributes without context.id', async ({ client, assert }) => {
    const sentAt = new Date((REPLY_UNIX - 3600) * 1000)
    const seeded = await seedCampaignThread({
      sentAt,
      outboundWamid: 'wamid.out.window',
      contactWaId: '15551110002',
      phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
    })
    orgIds.push(seeded.organizationId)

    const inbound = signedInbound({
      phoneNumberId: seeded.phoneNumberId,
      contactWaId: seeded.contactWaId,
      inboundId: 'wamid.in.window',
      body: 'Interested',
    })
    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', inbound.signature)
      .json(inbound.payload)
    response.assertStatus(200)

    const state = await readAttribution(
      seeded.organizationId,
      seeded.conversationId,
      seeded.broadcastId
    )
    assert.equal(state.attributedCampaignId, seeded.broadcastId)
    assert.equal(state.repliedCount, 1)
  })

  test('free-text outside the window stays organic', async ({ client, assert }) => {
    const sentAt = new Date((REPLY_UNIX - 49 * 3600) * 1000)
    const seeded = await seedCampaignThread({
      sentAt,
      outboundWamid: 'wamid.out.old',
      contactWaId: '15551110003',
      phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
    })
    orgIds.push(seeded.organizationId)

    const inbound = signedInbound({
      phoneNumberId: seeded.phoneNumberId,
      contactWaId: seeded.contactWaId,
      inboundId: 'wamid.in.old',
      body: 'Hello',
    })
    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', inbound.signature)
      .json(inbound.payload)
    response.assertStatus(200)

    const state = await readAttribution(
      seeded.organizationId,
      seeded.conversationId,
      seeded.broadcastId
    )
    assert.isNull(state.attributedCampaignId)
    assert.equal(state.repliedCount, 0)
    assert.isNull(state.repliedAt)
  })
})
