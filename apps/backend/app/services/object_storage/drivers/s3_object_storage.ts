import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  ObjectStorage,
  type ObjectHeadResult,
  type PresignedUpload,
} from '#services/object_storage/contracts/object_storage'

export type S3ObjectStorageConfig = {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export default class S3ObjectStorage extends ObjectStorage {
  readonly #client: S3Client
  readonly #bucket: string

  constructor(config: S3ObjectStorageConfig) {
    super()
    this.#bucket = config.bucket
    this.#client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Browser PUTs via presigned URL cannot satisfy flexible request checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  async createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
  }): Promise<PresignedUpload> {
    const expiresInSeconds = params.expiresInSeconds ?? 15 * 60
    // Sign ContentType only — Content-Length in SignedHeaders makes browser
    // preflight/PUT brittle across clients.
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: params.key,
      ContentType: params.contentType,
    })
    const url = await getSignedUrl(this.#client, command, { expiresIn: expiresInSeconds })
    return {
      method: 'PUT',
      url,
      headers: {
        'Content-Type': params.contentType,
      },
      expiresInSeconds,
    }
  }

  async headObject(key: string): Promise<ObjectHeadResult | null> {
    try {
      const result = await this.#client.send(
        new HeadObjectCommand({
          Bucket: this.#bucket,
          Key: key,
        })
      )
      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        eTag: result.ETag ?? null,
      }
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  async getObjectPrefix(params: { key: string; maxBytes: number }): Promise<Uint8Array | null> {
    const end = Math.max(0, params.maxBytes - 1)
    try {
      const result = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: params.key,
          Range: `bytes=0-${end}`,
        })
      )
      if (!result.Body) return new Uint8Array()
      return await result.Body.transformToByteArray()
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: key,
      })
    )
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  const status =
    '$metadata' in error &&
    error.$metadata &&
    typeof error.$metadata === 'object' &&
    'httpStatusCode' in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : null
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404
}
