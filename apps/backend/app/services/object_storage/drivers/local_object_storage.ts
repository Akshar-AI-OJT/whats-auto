import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ObjectStorage,
  type ObjectHeadResult,
  type PresignedUpload,
} from '#services/object_storage/contracts/object_storage'
import { buildLocalMediaUploadUrl } from '#lib/media/media_upload_signature'

export type LocalObjectStorageConfig = {
  root: string
  appUrl: string
  signingSecret: string
}

/**
 * Filesystem ObjectStorage for Contabo / single-VPS deploys.
 * Browser PUT targets an HMAC-signed API URL (see MediaUploadsController.putContent).
 */
export default class LocalObjectStorage extends ObjectStorage {
  readonly #root: string
  readonly #appUrl: string
  readonly #signingSecret: string

  constructor(config: LocalObjectStorageConfig) {
    super()
    this.#root = path.resolve(config.root)
    this.#appUrl = config.appUrl
    this.#signingSecret = config.signingSecret
  }

  #resolveKey(key: string): string {
    const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/')
    if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')) {
      throw new Error('Invalid storage key')
    }
    const absolute = path.resolve(this.#root, normalized)
    const rootWithSep = this.#root.endsWith(path.sep) ? this.#root : `${this.#root}${path.sep}`
    if (absolute !== this.#root && !absolute.startsWith(rootWithSep)) {
      throw new Error('Storage key escapes media root')
    }
    return absolute
  }

  async createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
    assetId?: string
    organizationId?: string
  }): Promise<PresignedUpload> {
    if (!params.assetId || !params.organizationId) {
      throw new Error('LocalObjectStorage requires assetId and organizationId for presign')
    }
    const expiresInSeconds = params.expiresInSeconds ?? 15 * 60
    const { url } = buildLocalMediaUploadUrl({
      appUrl: this.#appUrl,
      assetId: params.assetId,
      storageKey: params.key,
      organizationId: params.organizationId,
      secret: this.#signingSecret,
      expiresInSeconds,
    })
    return {
      method: 'PUT',
      url,
      headers: {
        'Content-Type': params.contentType,
      },
      expiresInSeconds,
    }
  }

  async writeObject(params: { key: string; body: Uint8Array; contentType: string }): Promise<void> {
    const filePath = this.#resolveKey(params.key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, Buffer.from(params.body))
  }

  async headObject(key: string): Promise<ObjectHeadResult | null> {
    try {
      const filePath = this.#resolveKey(key)
      const info = await stat(filePath)
      if (!info.isFile()) return null
      const prefix = await readFile(filePath)
      const eTag = `"${createHash('md5').update(prefix).digest('hex')}"`
      return {
        contentLength: info.size,
        contentType: null,
        eTag,
      }
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async getObjectPrefix(params: { key: string; maxBytes: number }): Promise<Uint8Array | null> {
    try {
      const filePath = this.#resolveKey(params.key)
      const body = await readFile(filePath)
      return new Uint8Array(body.subarray(0, Math.max(0, params.maxBytes)))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      const filePath = this.#resolveKey(key)
      await rm(filePath, { force: true })
    } catch (error) {
      if (isNotFound(error)) return
      throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
