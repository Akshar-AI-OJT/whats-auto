import {
  DeleteObjectCommand,
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
    })
  }

  async createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
  }): Promise<PresignedUpload> {
    const expiresInSeconds = params.expiresInSeconds ?? 15 * 60
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    })
    const url = await getSignedUrl(this.#client, command, { expiresIn: expiresInSeconds })
    return {
      method: 'PUT',
      url,
      headers: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
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
