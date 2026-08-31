import { createHmac, timingSafeEqual } from 'node:crypto'

export type MediaUploadSignaturePayload = {
  assetId: string
  storageKey: string
  organizationId: string
  expiresAtUnix: number
}

function payloadString(payload: MediaUploadSignaturePayload): string {
  return [
    payload.assetId,
    payload.storageKey,
    payload.organizationId,
    String(payload.expiresAtUnix),
  ].join('|')
}

/** HMAC-SHA256 hex signature for local-disk media upload URLs. */
export function signMediaUpload(params: {
  secret: string
  payload: MediaUploadSignaturePayload
}): string {
  return createHmac('sha256', params.secret).update(payloadString(params.payload)).digest('hex')
}

export function verifyMediaUploadSignature(params: {
  secret: string
  payload: MediaUploadSignaturePayload
  signature: string
}): boolean {
  if (!params.signature || params.payload.expiresAtUnix * 1000 < Date.now()) {
    return false
  }
  const expected = signMediaUpload({ secret: params.secret, payload: params.payload })
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(params.signature, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function buildLocalMediaUploadUrl(params: {
  appUrl: string
  assetId: string
  storageKey: string
  organizationId: string
  secret: string
  expiresInSeconds: number
}): { url: string; expiresAtUnix: number } {
  const expiresAtUnix = Math.floor(Date.now() / 1000) + params.expiresInSeconds
  const signature = signMediaUpload({
    secret: params.secret,
    payload: {
      assetId: params.assetId,
      storageKey: params.storageKey,
      organizationId: params.organizationId,
      expiresAtUnix,
    },
  })
  const base = params.appUrl.replace(/\/$/, '')
  const url = new URL(`${base}/api/v1/media/uploads/${params.assetId}/content`)
  url.searchParams.set('expires', String(expiresAtUnix))
  url.searchParams.set('key', params.storageKey)
  url.searchParams.set('org', params.organizationId)
  url.searchParams.set('sig', signature)
  return { url: url.toString(), expiresAtUnix }
}
