import { test } from '@japa/runner'
import {
  signRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from '#lib/razorpay/payment_signature'

test.group('razorpay payment signature', () => {
  const secret = 'test_razorpay_key_secret'
  const orderId = 'order_test_1'
  const paymentId = 'pay_test_1'

  test('accepts a valid Checkout.js signature', ({ assert }) => {
    const signature = signRazorpayPayment(orderId, paymentId, secret)
    assert.isTrue(verifyRazorpayPaymentSignature(orderId, paymentId, signature, secret))
  })

  test('rejects a tampered order or payment id', ({ assert }) => {
    const signature = signRazorpayPayment(orderId, paymentId, secret)
    assert.isFalse(verifyRazorpayPaymentSignature('order_other', paymentId, signature, secret))
    assert.isFalse(verifyRazorpayPaymentSignature(orderId, 'pay_other', signature, secret))
  })

  test('rejects missing or wrong signature', ({ assert }) => {
    assert.isFalse(verifyRazorpayPaymentSignature(orderId, paymentId, '', secret))
    assert.isFalse(verifyRazorpayPaymentSignature(orderId, paymentId, 'deadbeef', secret))
  })
})
