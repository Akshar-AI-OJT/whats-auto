import type { OutboundMediaType } from '#lib/meta_whatsapp/outbound_media'
import { type MediaAssetSource, MediaStorageFolder } from '#lib/media/types'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
}

const MEDIA_TYPE_TO_FOLDER: Record<OutboundMediaType, MediaStorageFolder> = {
  image: MediaStorageFolder.Images,
  document: MediaStorageFolder.Documents,
}

export function mediaFolderForType(mediaType: OutboundMediaType): MediaStorageFolder {
  return MEDIA_TYPE_TO_FOLDER[mediaType]
}

/**
 * Prefer MIME → extension; fall back to a sanitized filename extension; else empty.
 * Never trusts raw user filenames as key path segments beyond the extension.
 */
export function extensionForMedia(params: { mimeType: string; fileName?: string }): string {
  const fromMime = MIME_TO_EXT[params.mimeType.toLowerCase().split(';')[0]?.trim() ?? '']
  if (fromMime) return fromMime

  const name = params.fileName?.trim() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''

  const ext = name
    .slice(dot)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
  return /^[.][a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

export type BuildMediaStorageKeyParams = {
  organizationId: string
  source: MediaAssetSource
  mediaType: OutboundMediaType
  assetId: string
  mimeType: string
  fileName?: string
  /** Defaults to now (UTC). */
  at?: Date
}

/**
 * Hierarchical private object key for org media:
 * `{organizationId}/{source}/{mediaType}/{yyyy}/{mm}/{assetId}{ext}`
 */
export function buildMediaStorageKey(params: BuildMediaStorageKeyParams): string {
  const at = params.at ?? new Date()
  const year = String(at.getUTCFullYear())
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const folder = mediaFolderForType(params.mediaType)
  const ext = extensionForMedia({ mimeType: params.mimeType, fileName: params.fileName })

  return [
    params.organizationId,
    params.source,
    folder,
    year,
    month,
    `${params.assetId}${ext}`,
  ].join('/')
}
