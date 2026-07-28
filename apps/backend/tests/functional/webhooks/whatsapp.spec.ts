import { test } from '@japa/runner'
import env from '#start/env'
import { signMetaWebhookPayload } from '#lib/meta_whatsapp/webhook_signature'

test.group('WhatsApp webhook HTTP', () => {
  test('GET returns challenge when verify token matches', async ({ client, assert }) => {
    const challenge = 'meta-challenge-123'
    const response = await client.get('/api/v1/webhooks/whatsapp').qs({
      'hub.mode': 'subscribe',
      'hub.verify_token': env.get('WHATSAPP_VERIFY_TOKEN'),
      'hub.challenge': challenge,
    })

    response.assertStatus(200)
    assert.equal(response.text(), challenge)
  })

  test('GET rejects wrong verify token', async ({ client }) => {
    const response = await client.get('/api/v1/webhooks/whatsapp').qs({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'x',
    })

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_WA_WEBHOOK_VERIFY_TOKEN' })
  })

  test('POST accepts a valid signature', async ({ client }) => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba', changes: [{ field: 'messages', value: {} }] }],
    }
    const rawBody = JSON.stringify(payload)
    const signature = signMetaWebhookPayload(rawBody, env.get('META_APP_SECRET').release())

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('Content-Type', 'application/json')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)
    response.assertBody({ success: true })
  })

  test('POST rejects an invalid signature', async ({ client }) => {
    const payload = { object: 'whatsapp_business_account', entry: [] }

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', 'sha256=deadbeef')
      .json(payload)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_WA_WEBHOOK_SIGNATURE' })
  })
})
