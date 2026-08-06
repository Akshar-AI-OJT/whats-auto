import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { signMetaWebhookPayload } from '#lib/meta_whatsapp/webhook_signature'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `wa-ing-${id.slice(0, 8)}`
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
      status: true,
    })
    .returning(['id'])
  return row.id as string
}

async function seedConnectedWhatsappConfig(organizationId: string, phoneNumberId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId,
        wabaId: 'waba-ingest',
        accessToken: encryptWhatsappAccessToken('plain-token-ingest'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id', 'phoneNumberId'])

    return {
      whatsappConfigId: config.id as string,
      phoneNumberId: config.phoneNumberId as string,
    }
  })
}

function buildInboundMessagesPayload(params: {
  phoneNumberId: string
  waId: string
  providerMessageId: string
  text: string
  profileName?: string
}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-ingest',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: params.phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: params.profileName ?? 'Inbound Contact' },
                  wa_id: params.waId,
                },
              ],
              messages: [
                {
                  from: params.waId,
                  id: params.providerMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: params.text },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

test.group('WhatsApp webhook ingestion', (group) => {
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

  test('POST inbound text creates contact, conversation, and message; duplicate is idempotent', async ({
    client,
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const phoneNumberId = `pn-ing-${randomUUID().slice(0, 8)}`
    await seedConnectedWhatsappConfig(organizationId, phoneNumberId)

    const waId = '15559876543'
    const providerMessageId = `wamid.ingest.${randomUUID()}`
    const contentText = 'Hello from webhook ingest'
    const payload = buildInboundMessagesPayload({
      phoneNumberId,
      waId,
      providerMessageId,
      text: contentText,
    })
    const rawBody = JSON.stringify(payload)
    const signature = signMetaWebhookPayload(rawBody, env.get('META_APP_SECRET').release())

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)
    response.assertBody({ success: true })

    await runWithTenant(organizationId, async () => {
      const contact = await db
        .from('contacts')
        .where('organizationId', organizationId)
        .where('phoneNormalized', waId.replace(/\D/g, ''))
        .whereNull('deletedAt')
        .first()

      assert.isNotNull(contact)
      assert.equal(contact.phoneNormalized, '15559876543')

      const conversation = await db
        .from('conversations')
        .where('organizationId', organizationId)
        .where('contactId', contact.id)
        .first()

      assert.isNotNull(conversation)
      assert.equal(conversation.status, 'open')

      const messages = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('providerMessageId', providerMessageId)

      assert.lengthOf(messages, 1)
      assert.equal(messages[0].senderType, 'contact')
      assert.equal(messages[0].contentText, contentText)
      assert.equal(messages[0].providerMessageId, providerMessageId)
      assert.equal(messages[0].conversationId, conversation.id)
    })

    const again = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    again.assertStatus(200)
    again.assertBody({ success: true })

    await runWithTenant(organizationId, async () => {
      const messages = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('providerMessageId', providerMessageId)

      assert.lengthOf(messages, 1)
    })
  })
})
