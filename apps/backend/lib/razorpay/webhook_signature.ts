import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify Razorpay `X-Razorpay-Signature` (HMAC-SHA256 hex of raw body).
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string
): boolean {
  if (!signatureHeader) {
    return false
  }

  const expectedHex = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex')

  try {
    const received = Buffer.from(signatureHeader, 'utf8')
    const expected = Buffer.from(expectedHex, 'utf8')
    if (received.length !== expected.length) {
      return false
    }
    return timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export function signRazorpayWebhookPayload(rawBody: string, webhookSecret: string): string {
  return createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex')
}
