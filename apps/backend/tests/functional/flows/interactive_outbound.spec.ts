import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import type { MetaInteractivePayload } from '#lib/meta_whatsapp/interactive_message'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `flow-out-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Flow Out ${slug}`,
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

async function seedConversation(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-flow-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-flow',
        accessToken: encryptWhatsappAccessToken('plain-token-flow'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id', 'phoneNumberId'])

    const phone = '15551234888'
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Flow Contact',
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

    const now = new Date()
    await db.table('messages').insert({
      organizationId,
      conversationId: conversation.id,
      senderType: 'contact',
      senderId: null,
      contentType: 'text',
      contentText: 'hi',
      status: 'delivered',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    return {
      whatsappConfigId: config.id as string,
      phoneNumberId: config.phoneNumberId as string,
      conversationId: conversation.id as string,
    }
  })
}

function capturingGraph() {
  const sent: Array<{ to: string; interactive: MetaInteractivePayload }> = []
  const graph = {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'x' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async () => ({ id: '1' }),
    sendTextMessage: async () => ({ messageId: 'wamid.out.text', raw: {} }),
    sendTemplateMessage: async () => ({ messageId: 'wamid.out.tpl', raw: {} }),
    sendMediaMessage: async () => ({ messageId: 'wamid.out.media', raw: {} }),
    sendInteractiveMessage: async (params: { to: string; interactive: MetaInteractivePayload }) => {
      sent.push({ to: params.to, interactive: params.interactive })
      return { messageId: 'wamid.out.interactive', raw: {} }
    },
  } as MetaGraphClient
  return { graph, sent }
}

const buttonPayload: MetaInteractivePayload = {
  type: 'button',
  header: { type: 'text', text: 'Welcome' },
  body: { text: 'How can we help?' },
  footer: { text: 'WhatsAuto' },
  action: {
    buttons: [
      { type: 'reply', reply: { id: 'btn_products', title: 'Products' } },
      { type: 'reply', reply: { id: 'btn_support', title: 'Support' } },
      { type: 'reply', reply: { id: 'btn_stop', title: 'Stop' } },
    ],
  },
}

const listPayload: MetaInteractivePayload = {
  type: 'list',
  body: { text: 'Pick a product' },
  action: {
    button: 'View options',
    sections: [
      {
        title: 'Catalog',
        rows: [
          { id: 'opt_a', title: 'Product A', description: 'First item' },
          { id: 'opt_b', title: 'Product B' },
        ],
      },
    ],
  },
}

test.group('Flows | interactive outbound', (group) => {
  const orgIds: string[] = []

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

  test('queueInteractive + executeDispatch sends Meta button JSON without truncating', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const { graph, sent } = capturingGraph()
    const service = new WhatsappOutboundService(graph)

    const queued = await service.queueInteractive({
      organizationId,
      conversationId: seeded.conversationId,
      interactive: buttonPayload,
      senderType: 'system',
    })

    await runWithTenant(organizationId, async () => {
      const message = await db.from('messages').where('id', queued.messageId).first()
      const dispatch = await db.from('outbound_dispatches').where('id', queued.dispatchId).first()
      assert.equal(message.contentType, 'interactive')
      assert.equal(message.contentText, 'How can we help?')
      assert.equal(dispatch.payload.kind, 'interactive')
      assert.deepEqual(dispatch.payload.interactive, buttonPayload)
    })

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-flow-interactive',
    })

    assert.equal(result.outcome, 'sent')
    assert.lengthOf(sent, 1)
    assert.equal(sent[0].to, '15551234888')
    assert.deepEqual(sent[0].interactive, buttonPayload)
  })

  test('executeDispatch sends Meta list JSON shape', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const { graph, sent } = capturingGraph()
    const service = new WhatsappOutboundService(graph)

    const queued = await service.queueInteractive({
      organizationId,
      conversationId: seeded.conversationId,
      interactive: listPayload,
    })

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-flow-list',
    })

    assert.equal(result.outcome, 'sent')
    assert.deepEqual(sent[0].interactive, listPayload)
    assert.equal(sent[0].interactive.action.button, 'View options')
    assert.equal(sent[0].interactive.action.sections?.[0].rows[0].id, 'opt_a')
  })

  test('queueInteractive throws on Meta limit violations without enqueueing', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const { graph, sent } = capturingGraph()
    const service = new WhatsappOutboundService(graph)

    try {
      await service.queueInteractive({
        organizationId,
        conversationId: seeded.conversationId,
        interactive: {
          type: 'button',
          body: { text: 'Too many' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'a', title: 'A' } },
              { type: 'reply', reply: { id: 'b', title: 'B' } },
              { type: 'reply', reply: { id: 'c', title: 'C' } },
              { type: 'reply', reply: { id: 'd', title: 'D' } },
            ],
          },
        },
      })
      assert.fail('expected invalidInteractive')
    } catch (error) {
      assert.instanceOf(error, WhatsappOutboundException)
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_INTERACTIVE_LIMITS')
    }

    await runWithTenant(organizationId, async () => {
      const dispatches = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
      assert.lengthOf(dispatches, 0)
    })
    assert.lengthOf(sent, 0)
  })

  test('queueInteractive throws when a button title exceeds 20 characters', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(capturingGraph().graph)

    try {
      await service.queueInteractive({
        organizationId,
        conversationId: seeded.conversationId,
        interactive: {
          type: 'button',
          body: { text: 'Nope' },
          action: {
            buttons: [{ type: 'reply', reply: { id: 'btn', title: 'This title is 21 chars!' } }],
          },
        },
      })
      assert.fail('expected invalidInteractive')
    } catch (error) {
      assert.instanceOf(error, WhatsappOutboundException)
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_INTERACTIVE_LIMITS')
    }
  })
})
