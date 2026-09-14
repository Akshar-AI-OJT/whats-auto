import type { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import LocalObjectStorage from '#services/object_storage/drivers/local_object_storage'
import S3ObjectStorage from '#services/object_storage/drivers/s3_object_storage'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

type ResolvedS3Config = {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  endpoint?: string
  forcePathStyle?: boolean
}

/**
 * Resolve S3 credentials from S3_* env vars only.
 */
function resolveS3ConfigFromEnv(): ResolvedS3Config {
  const accessKeyId = env.get('S3_ACCESS_KEY_ID') ?? ''
  const secretAccessKey = env.get('S3_SECRET_ACCESS_KEY')?.release() ?? ''
  const region = env.get('S3_REGION') ?? ''
  const bucket = env.get('S3_BUCKET') ?? ''
  const endpoint = env.get('S3_ENDPOINT') ?? undefined

  const missing: string[] = []
  if (!accessKeyId) missing.push('S3_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY')
  if (!region) missing.push('S3_REGION')
  if (!bucket) missing.push('S3_BUCKET')
  if (missing.length > 0) {
    throw new Error(
      `Missing object storage configuration when OBJECT_STORAGE_DRIVER=s3: ${missing.join(', ')}. ` +
        'S3_ENDPOINT is optional for native AWS S3; set it for Railway/Contabo/R2 (Railway: S3_ENDPOINT=${{ bucket.ENDPOINT }}).'
    )
  }

  const forcePathStyle = env.get('S3_FORCE_PATH_STYLE')

  return {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle !== undefined ? { forcePathStyle } : {}),
  }
}

/**
 * Resolves ObjectStorage from env. Prefer IoC `ObjectStorage` in app code;
 * this factory is for Ace/scripts that skip the provider.
 */
export function createObjectStorageFromEnv(): ObjectStorage {
  const driver = env.get('OBJECT_STORAGE_DRIVER')
  if (driver === 'fs') {
    const root = env.get('MEDIA_LOCAL_ROOT') ?? app.makePath('media')
    return new LocalObjectStorage({
      root,
      appUrl: env.get('APP_URL'),
      signingSecret: env.get('APP_KEY').release(),
    })
  }

  const s3 = resolveS3ConfigFromEnv()

  return new S3ObjectStorage({
    region: s3.region,
    bucket: s3.bucket,
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
    ...(s3.forcePathStyle !== undefined ? { forcePathStyle: s3.forcePathStyle } : {}),
  })
}
