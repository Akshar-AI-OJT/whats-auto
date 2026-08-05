import { test } from '@japa/runner'
import {
  signRazorpayWebhookPayload,
  verifyRazorpayWebhookSignature,
} from '#lib/razorpay/webhook_signature'

test.group('razorpay webhook signature', () => {
  const secret = 'test_razorpay_webhook_secret'
  const body = '{"event":"payment.captured","payload":{}}'

  test('accepts a valid signature', ({ assert }) => {
    const header = signRazorpayWebhookPayload(body, secret)
    assert.isTrue(verifyRazorpayWebhookSignature(body, header, secret))
  })

  test('rejects a tampered body', ({ assert }) => {
    const header = signRazorpayWebhookPayload(body, secret)
    assert.isFalse(verifyRazorpayWebhookSignature(`${body} `, header, secret))
  })

  test('rejects missing or wrong signature', ({ assert }) => {
    assert.isFalse(verifyRazorpayWebhookSignature(body, undefined, secret))
    assert.isFalse(verifyRazorpayWebhookSignature(body, 'deadbeef', secret))
  })
})
