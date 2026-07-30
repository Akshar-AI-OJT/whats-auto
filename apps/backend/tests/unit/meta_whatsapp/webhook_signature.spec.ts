import { test } from '@japa/runner'
import {
  signMetaWebhookPayload,
  verifyMetaWebhookSignature,
} from '#lib/meta_whatsapp/webhook_signature'

test.group('meta webhook signature', () => {
  const secret = 'test-meta-app-secret'
  const body = '{"object":"whatsapp_business_account","entry":[]}'

  test('accepts a valid sha256 signature', ({ assert }) => {
    const header = signMetaWebhookPayload(body, secret)
    assert.isTrue(verifyMetaWebhookSignature(body, header, secret))
  })

  test('rejects a tampered body', ({ assert }) => {
    const header = signMetaWebhookPayload(body, secret)
    assert.isFalse(verifyMetaWebhookSignature(`${body} `, header, secret))
  })

  test('rejects missing or malformed header', ({ assert }) => {
    assert.isFalse(verifyMetaWebhookSignature(body, undefined, secret))
    assert.isFalse(verifyMetaWebhookSignature(body, 'sha1=abc', secret))
    assert.isFalse(verifyMetaWebhookSignature(body, 'sha256=not-hex', secret))
  })
})
