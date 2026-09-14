import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify Checkout.js payment signature (HMAC-SHA256 hex of `orderId|paymentId`).
 */
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  if (!orderId || !paymentId || !signature) {
    return false
  }

  const expectedHex = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  try {
    const received = Buffer.from(signature, 'utf8')
    const expected = Buffer.from(expectedHex, 'utf8')
    if (received.length !== expected.length) {
      return false
    }
    return timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export function signRazorpayPayment(orderId: string, paymentId: string, keySecret: string): string {
  return createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
}
