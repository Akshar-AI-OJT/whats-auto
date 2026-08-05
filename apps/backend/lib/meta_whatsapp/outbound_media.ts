/**
 * Outbound media URL / MIME / size rules for WhatsApp Cloud API free-form media.
 * Host allowlist is optional via OUTBOUND_MEDIA_ALLOWED_HOSTS (comma-separated).
 */

export type OutboundMediaType = 'image' | 'video' | 'audio' | 'document'

/** Meta Cloud API free-form media size limits (bytes). */
export const OUTBOUND_MEDIA_MAX_BYTES: Record<OutboundMediaType, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

const ALLOWED_MIME_TYPES: Record<OutboundMediaType, ReadonlySet<string>> = {
  image: new Set(['image/jpeg', 'image/png']),
  video: new Set(['video/mp4', 'video/3gpp']),
  audio: new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg']),
  document: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
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
export function isApprovedOutboundMediaUrl(
  value: string,
  allowedHosts: string[] = []
): boolean {
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

  return allowedHosts.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  )
}

export function isMimeTypeAllowedForMediaType(
  mediaType: OutboundMediaType,
  mimeType: string
): boolean {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? ''
  return ALLOWED_MIME_TYPES[mediaType].has(normalized)
}

export function isOutboundMediaSizeAllowed(
  mediaType: OutboundMediaType,
  fileSize: number
): boolean {
  if (!Number.isFinite(fileSize) || fileSize < 0) return false
  return fileSize <= OUTBOUND_MEDIA_MAX_BYTES[mediaType]
}
