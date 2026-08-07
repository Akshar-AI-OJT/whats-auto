import {
  ObjectStorage,
  type ObjectHeadResult,
  type PresignedUpload,
} from '#services/object_storage/contracts/object_storage'

type StoredObject = {
  body: Buffer
  contentType: string
}

/**
 * In-memory object store for unit tests. Presigned URL is a stub handle, not HTTP.
 */
export default class FakeObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, StoredObject>()
  readonly deletedKeys: string[] = []
  readonly presigned: Array<{
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds: number
  }> = []

  async createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
  }): Promise<PresignedUpload> {
    const expiresInSeconds = params.expiresInSeconds ?? 15 * 60
    this.presigned.push({
      key: params.key,
      contentType: params.contentType,
      contentLength: params.contentLength,
      expiresInSeconds,
    })
    return {
      method: 'PUT',
      url: `fake://upload/${encodeURIComponent(params.key)}`,
      headers: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
      },
      expiresInSeconds,
    }
  }

  /** Test helper: simulate a completed browser upload. */
  putObject(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType })
  }

  async headObject(key: string): Promise<ObjectHeadResult | null> {
    const object = this.objects.get(key)
    if (!object) return null
    return {
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      eTag: `"fake-${object.body.byteLength}"`,
    }
  }

  async getObjectPrefix(params: { key: string; maxBytes: number }): Promise<Uint8Array | null> {
    const object = this.objects.get(params.key)
    if (!object) return null
    return new Uint8Array(object.body.subarray(0, params.maxBytes))
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key)
    this.deletedKeys.push(key)
  }
}
