import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify Meta Cloud API `X-Hub-Signature-256` against the raw request body.
 * Pure helper — no env/HTTP coupling so Phase 3+ and tests can reuse it.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false
  }

  const receivedHex = signatureHeader.slice('sha256='.length)
  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')

  try {
    const received = Buffer.from(receivedHex, 'hex')
    const expected = Buffer.from(expectedHex, 'hex')
    if (received.length !== expected.length) {
      return false
    }
    return timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export function signMetaWebhookPayload(rawBody: string, appSecret: string): string {
  const hex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return `sha256=${hex}`
}
