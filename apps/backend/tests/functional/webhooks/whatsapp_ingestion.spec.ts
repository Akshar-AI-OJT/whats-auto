import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import emitter from '@adonisjs/core/services/emitter'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import InboxMessageReceived from '#events/inbox_message_received'
import InboxStatusUpdated from '#events/inbox_status_updated'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { signMetaWebhookPayload } from '#lib/meta_whatsapp/webhook_signature'
import { runWithTenant } from '#services/tenant_context'

type Fixture = {
  organizationId: string
  whatsappConfigId: string
  phoneNumberId: string
}

async function createOrg(params?: { status?: boolean; deletedAt?: Date | null }) {
  const id = randomUUID()
  const slug = `wa-ingest-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `WA Ingest ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: params?.status ?? true,
      deletedAt: params?.deletedAt ?? null,
    })
    .returning(['id'])

  return row.id as string
}

async function createConnectedConfig(organizationId: string, phoneNumberId: string) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId,
        wabaId: 'waba-test',
        accessToken: encryptWhatsappAccessToken('plain-token-test'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedOutboundMessage(params: {
  organizationId: string
  whatsappConfigId: string
  contactWaId: string
  providerMessageId: string
  status?: string
  providerStatusAt?: Date
}) {
  return runWithTenant(params.organizationId, async () => {
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId: params.organizationId,
        phone: params.contactWaId,
        phoneNormalized: params.contactWaId.replace(/\D/g, ''),
        name: 'Outbound Contact',
        customFields: {},
      })
      .returning(['id'])

    const [conversation] = await db
      .table('conversations')
      .insert({
        organizationId: params.organizationId,
        whatsappConfigId: params.whatsappConfigId,
        contactId: contact.id,
        status: 'open',
        unreadCount: 0,
      })
      .returning(['id'])

    const [message] = await db
      .table('messages')
      .insert({
        organizationId: params.organizationId,
        conversationId: conversation.id,
        senderType: 'agent',
        contentType: 'text',
        contentText: 'outbound hello',
        providerMessageId: params.providerMessageId,
        status: params.status ?? 'sent',
        providerStatusAt: params.providerStatusAt ?? new Date('2024-01-01T00:00:00.000Z'),
        sentAt: params.providerStatusAt ?? new Date('2024-01-01T00:00:00.000Z'),
        metadata: {},
      })
      .returning(['id', 'conversationId'])

    return {
      contactId: contact.id as string,
      conversationId: conversation.id as string,
      messageId: message.id as string,
    }
  })
}

async function cleanupOrg(organizationId: string) {
  await db.from('organizations').where('id', organizationId).delete()
}

function signedPayload(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload)
  const signature = signMetaWebhookPayload(rawBody, env.get('META_APP_SECRET').release())
  return { payload, signature }
}

function messagesValue(params: {
  phoneNumberId: string
  messages?: unknown[]
  statuses?: unknown[]
  contacts?: unknown[]
}) {
  return {
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: '15550001111',
      phone_number_id: params.phoneNumberId,
    },
    contacts: params.contacts,
    messages: params.messages,
    statuses: params.statuses,
  }
}

test.group('WhatsApp webhook ingestion', (group) => {
  const fixtures: Fixture[] = []

  group.each.setup(async () => {
    // no-op — fixtures created per test
  })

  group.each.teardown(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (fixture) await cleanupOrg(fixture.organizationId)
    }
  })

  async function createFixture(phoneNumberId = `pn-${randomUUID().slice(0, 8)}`): Promise<Fixture> {
    const organizationId = await createOrg()
    const whatsappConfigId = await createConnectedConfig(organizationId, phoneNumberId)
    const fixture = { organizationId, whatsappConfigId, phoneNumberId }
    fixtures.push(fixture)
    return fixture
  }

  test('ingests signed text inbound webhook into contact, conversation, and message', async ({
    client,
    assert,
  }) => {
    const fixture = await createFixture()
    const events: InboxMessageReceived[] = []
    const onMessage = (event: InboxMessageReceived) => events.push(event)
    emitter.on(InboxMessageReceived, onMessage)

    try {
      const { payload, signature } = signedPayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: messagesValue({
                  phoneNumberId: fixture.phoneNumberId,
                  contacts: [{ wa_id: '15551112222', profile: { name: 'Ada Lovelace' } }],
                  messages: [
                    {
                      from: '15551112222',
                      id: 'wamid.text.1',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Hello inbox' },
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })

      const response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('Content-Type', 'application/json')
        .header('X-Hub-Signature-256', signature)
        .json(payload)

      response.assertStatus(200)

      await runWithTenant(fixture.organizationId, async () => {
        const contacts = await db.from('contacts').select('*')
        const conversations = await db.from('conversations').select('*')
        const messages = await db.from('messages').select('*')

        assert.lengthOf(contacts, 1)
        assert.equal(contacts[0].name, 'Ada Lovelace')
        assert.equal(contacts[0].phoneNormalized, '15551112222')

        assert.lengthOf(conversations, 1)
        assert.equal(conversations[0].unreadCount, 1)
        assert.equal(conversations[0].status, 'open')
        assert.equal(conversations[0].lastMessageText, 'Hello inbox')

        assert.lengthOf(messages, 1)
        assert.equal(messages[0].providerMessageId, 'wamid.text.1')
        assert.equal(messages[0].senderType, 'contact')
        assert.equal(messages[0].status, 'delivered')
        assert.isNull(messages[0].interactivePayload)
        assert.isNull(messages[0].mediaUrl)
      })

      assert.lengthOf(events, 1)
      assert.equal(events[0].payload.providerMessageId, 'wamid.text.1')
    } finally {
      emitter.off(InboxMessageReceived, onMessage)
    }
  })

  test('stores media, location, and interactive data only in metadata', async ({
    client,
    assert,
  }) => {
    const fixture = await createFixture()
    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: fixture.phoneNumberId,
                contacts: [{ wa_id: '15553334444', profile: { name: 'Media User' } }],
                messages: [
                  {
                    from: '15553334444',
                    id: 'wamid.image.1',
                    timestamp: '1700001000',
                    type: 'image',
                    image: { id: 'meta-media-1', mime_type: 'image/png', caption: 'Shot' },
                  },
                  {
                    from: '15553334444',
                    id: 'wamid.location.1',
                    timestamp: '1700001001',
                    type: 'location',
                    location: { latitude: 12.3, longitude: 45.6, name: 'Office' },
                  },
                  {
                    from: '15553334444',
                    id: 'wamid.interactive.1',
                    timestamp: '1700001002',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: 'yes', title: 'Confirm' },
                    },
                  },
                ],
              }),
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    await runWithTenant(fixture.organizationId, async () => {
      const messages = await db.from('messages').orderBy('occurredAt', 'asc').select('*')
      assert.lengthOf(messages, 3)

      for (const message of messages) {
        assert.isNull(message.interactivePayload)
        assert.isNull(message.interactiveReplyId)
      }

      assert.equal(messages[0].metadata.media.id, 'meta-media-1')
      assert.equal(messages[1].metadata.location.name, 'Office')
      assert.equal(messages[2].metadata.interactive.buttonReply.title, 'Confirm')

      const conversations = await db.from('conversations').select('*')
      assert.lengthOf(conversations, 1)
      assert.equal(conversations[0].unreadCount, 3)
    })
  })

  test('processes multiple Meta changes in one payload', async ({ client, assert }) => {
    const fixture = await createFixture()
    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: fixture.phoneNumberId,
                contacts: [{ wa_id: '15550000001' }],
                messages: [
                  {
                    from: '15550000001',
                    id: 'wamid.multi.1',
                    timestamp: '1700002000',
                    type: 'text',
                    text: { body: 'one' },
                  },
                ],
              }),
            },
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: fixture.phoneNumberId,
                contacts: [{ wa_id: '15550000001' }],
                messages: [
                  {
                    from: '15550000001',
                    id: 'wamid.multi.2',
                    timestamp: '1700002001',
                    type: 'text',
                    text: { body: 'two' },
                  },
                ],
              }),
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    await runWithTenant(fixture.organizationId, async () => {
      const messages = await db.from('messages').select('*')
      const conversations = await db.from('conversations').select('*')
      assert.lengthOf(messages, 2)
      assert.lengthOf(conversations, 1)
      assert.equal(conversations[0].unreadCount, 2)
    })
  })

  test('acknowledges unknown phone_number_id without creating rows', async ({ client, assert }) => {
    const fixture = await createFixture()
    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: 'unknown-phone-number',
                contacts: [{ wa_id: '15550000002' }],
                messages: [
                  {
                    from: '15550000002',
                    id: 'wamid.unknown.1',
                    timestamp: '1700003000',
                    type: 'text',
                    text: { body: 'nope' },
                  },
                ],
              }),
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    await runWithTenant(fixture.organizationId, async () => {
      assert.lengthOf(await db.from('messages').select('id'), 0)
      assert.lengthOf(await db.from('contacts').select('id'), 0)
    })
  })

  test('skips inactive organization configs', async ({ client, assert }) => {
    const organizationId = await createOrg({ status: false })
    const phoneNumberId = `pn-inactive-${randomUUID().slice(0, 8)}`
    const whatsappConfigId = await createConnectedConfig(organizationId, phoneNumberId)
    fixtures.push({ organizationId, whatsappConfigId, phoneNumberId })

    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId,
                contacts: [{ wa_id: '15550000003' }],
                messages: [
                  {
                    from: '15550000003',
                    id: 'wamid.inactive.1',
                    timestamp: '1700004000',
                    type: 'text',
                    text: { body: 'blocked' },
                  },
                ],
              }),
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    await runWithTenant(organizationId, async () => {
      assert.lengthOf(await db.from('messages').select('id'), 0)
    })
  })

  test('duplicate wamid inserts once and increments unread once', async ({ client, assert }) => {
    const fixture = await createFixture()
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: fixture.phoneNumberId,
                contacts: [{ wa_id: '15550000004' }],
                messages: [
                  {
                    from: '15550000004',
                    id: 'wamid.dup.1',
                    timestamp: '1700005000',
                    type: 'text',
                    text: { body: 'dup' },
                  },
                ],
              }),
            },
          ],
        },
      ],
    }

    for (let i = 0; i < 2; i++) {
      const { payload, signature } = signedPayload(body)
      const response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('X-Hub-Signature-256', signature)
        .json(payload)
      response.assertStatus(200)
    }

    await runWithTenant(fixture.organizationId, async () => {
      const messages = await db.from('messages').select('*')
      const conversations = await db.from('conversations').select('*')
      assert.lengthOf(messages, 1)
      assert.equal(conversations[0].unreadCount, 1)
    })
  })

  test('reopens a closed conversation on new inbound message', async ({ client, assert }) => {
    const fixture = await createFixture()

    await runWithTenant(fixture.organizationId, async () => {
      const [contact] = await db
        .table('contacts')
        .insert({
          organizationId: fixture.organizationId,
          phone: '15550000005',
          phoneNormalized: '15550000005',
          name: 'Closed Contact',
          customFields: {},
        })
        .returning(['id'])

      await db.table('conversations').insert({
        organizationId: fixture.organizationId,
        whatsappConfigId: fixture.whatsappConfigId,
        contactId: contact.id,
        status: 'closed',
        closedAt: new Date('2023-01-01T00:00:00.000Z'),
        unreadCount: 0,
        lastMessageText: 'old',
        lastMessageAt: new Date('2023-01-01T00:00:00.000Z'),
      })
    })

    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: messagesValue({
                phoneNumberId: fixture.phoneNumberId,
                contacts: [{ wa_id: '15550000005' }],
                messages: [
                  {
                    from: '15550000005',
                    id: 'wamid.reopen.1',
                    timestamp: '1700006000',
                    type: 'text',
                    text: { body: 'reopen please' },
                  },
                ],
              }),
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    await runWithTenant(fixture.organizationId, async () => {
      const conversations = await db.from('conversations').select('*')
      assert.lengthOf(conversations, 1)
      assert.equal(conversations[0].status, 'open')
      assert.isNull(conversations[0].closedAt)
      assert.equal(conversations[0].unreadCount, 1)
      assert.equal(conversations[0].lastMessageText, 'reopen please')
    })
  })

  test('updates delivery receipts and ignores stale out-of-order statuses', async ({
    client,
    assert,
  }) => {
    const fixture = await createFixture()
    const seeded = await seedOutboundMessage({
      organizationId: fixture.organizationId,
      whatsappConfigId: fixture.whatsappConfigId,
      contactWaId: '15550000006',
      providerMessageId: 'wamid.out.1',
      status: 'sent',
      providerStatusAt: new Date('2024-06-01T00:00:00.000Z'),
    })

    const statusEvents: InboxStatusUpdated[] = []
    const onStatus = (event: InboxStatusUpdated) => statusEvents.push(event)
    emitter.on(InboxStatusUpdated, onStatus)

    try {
      const delivered = signedPayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: messagesValue({
                  phoneNumberId: fixture.phoneNumberId,
                  statuses: [
                    {
                      id: 'wamid.out.1',
                      status: 'delivered',
                      timestamp: '1717200000',
                      recipient_id: '15550000006',
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })

      let response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('X-Hub-Signature-256', delivered.signature)
        .json(delivered.payload)
      response.assertStatus(200)

      const stale = signedPayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: messagesValue({
                  phoneNumberId: fixture.phoneNumberId,
                  statuses: [
                    {
                      id: 'wamid.out.1',
                      status: 'sent',
                      timestamp: '1717190000',
                      recipient_id: '15550000006',
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })

      response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('X-Hub-Signature-256', stale.signature)
        .json(stale.payload)
      response.assertStatus(200)

      const failed = signedPayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: messagesValue({
                  phoneNumberId: fixture.phoneNumberId,
                  statuses: [
                    {
                      id: 'wamid.out.1',
                      status: 'failed',
                      timestamp: '1717210000',
                      errors: [{ code: 131026, title: 'Message undeliverable' }],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })

      response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('X-Hub-Signature-256', failed.signature)
        .json(failed.payload)
      response.assertStatus(200)

      await runWithTenant(fixture.organizationId, async () => {
        const message = await db.from('messages').where('id', seeded.messageId).first()
        assert.equal(message.status, 'failed')
        assert.include(message.errorMessage ?? '', '131026')
        assert.isNotNull(message.failedAt)
        assert.isNotNull(message.deliveredAt)
      })

      assert.isAtLeast(statusEvents.length, 2)
      assert.equal(statusEvents[0].payload.status, 'delivered')
      assert.equal(statusEvents.at(-1)?.payload.status, 'failed')
    } finally {
      emitter.off(InboxStatusUpdated, onStatus)
    }
  })

  test('isolates tenants across two connected WhatsApp configs', async ({ client, assert }) => {
    const a = await createFixture(`pn-a-${randomUUID().slice(0, 8)}`)
    const b = await createFixture(`pn-b-${randomUUID().slice(0, 8)}`)

    for (const [fixture, wamid, waId] of [
      [a, 'wamid.tenant.a', '15550000007'],
      [b, 'wamid.tenant.b', '15550000008'],
    ] as const) {
      const { payload, signature } = signedPayload({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: messagesValue({
                  phoneNumberId: fixture.phoneNumberId,
                  contacts: [{ wa_id: waId }],
                  messages: [
                    {
                      from: waId,
                      id: wamid,
                      timestamp: '1700007000',
                      type: 'text',
                      text: { body: fixture.phoneNumberId },
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })

      const response = await client
        .post('/api/v1/webhooks/whatsapp')
        .header('X-Hub-Signature-256', signature)
        .json(payload)
      response.assertStatus(200)
    }

    await runWithTenant(a.organizationId, async () => {
      const messages = await db
        .from('messages')
        .where('organizationId', a.organizationId)
        .select('*')
      assert.lengthOf(messages, 1)
      assert.equal(messages[0].providerMessageId, 'wamid.tenant.a')
    })

    await runWithTenant(b.organizationId, async () => {
      const messages = await db
        .from('messages')
        .where('organizationId', b.organizationId)
        .select('*')
      assert.lengthOf(messages, 1)
      assert.equal(messages[0].providerMessageId, 'wamid.tenant.b')
    })
  })
})
