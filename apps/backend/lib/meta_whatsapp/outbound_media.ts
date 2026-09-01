/**
 * Outbound media URL / MIME / size rules for WhatsApp Cloud API.
 *
 * Product policy:
 * - Platform outbound kinds: image | document
 * - Tenant agents / upload API: image + document (JPEG/PNG + PDF/CSV/Office docs)
 * - Connected integrations (system channel): same image + document set
 * Host allowlist is optional via OUTBOUND_MEDIA_ALLOWED_HOSTS (comma-separated).
 *
 * Note: text/csv is accepted for library upload and outbound link delivery; Meta's
 * official document list does not include CSV, so client rendering may vary.
 */

export type OutboundMediaType = 'image' | 'document'

/** Media kinds tenants may upload or free-form send. */
export const TENANT_OUTBOUND_MEDIA_TYPES = ['image', 'document'] as const
export type TenantOutboundMediaType = (typeof TENANT_OUTBOUND_MEDIA_TYPES)[number]

/** Media kinds system/integration sends may use. */
export const SYSTEM_OUTBOUND_MEDIA_TYPES = ['image', 'document'] as const

/** Meta Cloud API free-form media size limits (bytes). */
export const OUTBOUND_MEDIA_MAX_BYTES: Record<OutboundMediaType, number> = {
  image: 5 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

const ALLOWED_MIME_TYPES: Record<OutboundMediaType, ReadonlySet<string>> = {
  image: new Set(['image/jpeg', 'image/png']),
  document: new Set([
    'application/pdf',
    'text/csv',
    'application/csv',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]),
}

export function parseOutboundMediaAllowedHosts(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0)
}

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Approved public storage URLs: must be http(s). When an allowlist is configured,
 * the hostname must match (exact or subdomain of an allowlisted host).
 */
export function isApprovedOutboundMediaUrl(value: string, allowedHosts: string[] = []): boolean {
  if (!isPublicHttpUrl(value)) return false

  let hostname: string
  try {
    hostname = new URL(value).hostname.toLowerCase()
  } catch {
    return false
  }

  if (allowedHosts.length === 0) {
    return true
  }

  return allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))
}

export function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(';')[0]?.trim() ?? ''
}

export function isMimeTypeAllowedForMediaType(
  mediaType: OutboundMediaType,
  mimeType: string
): boolean {
  return ALLOWED_MIME_TYPES[mediaType].has(normalizeMimeType(mimeType))
}

/** Resolve platform outbound media kind from MIME (image | document), or null. */
export function outboundMediaTypeForMime(mimeType: string): OutboundMediaType | null {
  const normalized = normalizeMimeType(mimeType)
  for (const mediaType of Object.keys(ALLOWED_MIME_TYPES) as OutboundMediaType[]) {
    if (ALLOWED_MIME_TYPES[mediaType].has(normalized)) return mediaType
  }
  return null
}

/** Tenant upload/send: image + document from the shared allowlist. */
export function tenantOutboundMediaTypeForMime(mimeType: string): TenantOutboundMediaType | null {
  const mediaType = outboundMediaTypeForMime(mimeType)
  if (!mediaType) return null
  return isTenantOutboundMediaType(mediaType) ? mediaType : null
}

export function isTenantOutboundMediaType(mediaType: string): mediaType is TenantOutboundMediaType {
  return (TENANT_OUTBOUND_MEDIA_TYPES as readonly string[]).includes(mediaType)
}

export function isOutboundMediaSizeAllowed(
  mediaType: OutboundMediaType,
  fileSize: number
): boolean {
  if (!Number.isFinite(fileSize) || fileSize < 0) return false
  return fileSize <= OUTBOUND_MEDIA_MAX_BYTES[mediaType]
}

/** MIME types accepted for Media Library upload (tenant + integration). */
export function listAllowedUploadMimeTypes(): string[] {
  return [...ALLOWED_MIME_TYPES.image, ...ALLOWED_MIME_TYPES.document]
}
