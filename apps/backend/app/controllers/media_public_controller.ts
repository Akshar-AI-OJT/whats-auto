import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import MediaException from '#exceptions/media_exception'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import env from '#start/env'

const STORAGE_KEY_PREFIX = 'organizations/'

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function storageKeyFromMediaPath(pathname: string): string | null {
  const prefix = '/media/'
  if (!pathname.startsWith(prefix)) return null
  const key = pathname.slice(prefix.length).replace(/^\/+/, '')
  if (!key || key.split('/').includes('..') || !key.startsWith(STORAGE_KEY_PREFIX)) {
    return null
  }
  return key
}

function mimeTypeForStorageKey(storageKey: string): string {
  const ext = storageKey.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME[ext] ?? 'application/octet-stream'
}

/**
 * Public media bytes for fs storage (browser open + WhatsApp link fetch).
 * S3/CloudFront mode should not hit this route in production.
 */
export default class MediaPublicController {
  async serve({ request, response }: HttpContext) {
    if (env.get('OBJECT_STORAGE_DRIVER') !== 'fs') {
      throw MediaException.notFound()
    }

    const pathname = new URL(request.completeUrl(true)).pathname
    const storageKey = storageKeyFromMediaPath(pathname)
    if (!storageKey) {
      throw MediaException.notFound()
    }

    const storage = await app.container.make(ObjectStorage)
    const head = await storage.headObject(storageKey)
    if (!head || head.contentLength <= 0) {
      throw MediaException.notFound()
    }

    const body = await storage.getObjectPrefix({
      key: storageKey,
      maxBytes: head.contentLength,
    })
    if (!body || body.byteLength !== head.contentLength) {
      throw MediaException.notFound()
    }

    const contentType = head.contentType ? head.contentType.split(';')[0]?.trim() : null

    return response
      .header('Content-Type', contentType ?? mimeTypeForStorageKey(storageKey))
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(Buffer.from(body))
  }
}
