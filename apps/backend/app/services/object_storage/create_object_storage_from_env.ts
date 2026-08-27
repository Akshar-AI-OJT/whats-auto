import type { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import LocalObjectStorage from '#services/object_storage/drivers/local_object_storage'
import S3ObjectStorage from '#services/object_storage/drivers/s3_object_storage'
import env from '#start/env'

/**
 * Resolves ObjectStorage from env. Prefer IoC `ObjectStorage` in app code;
 * this factory is for Ace/scripts that skip the provider.
 */
export function createObjectStorageFromEnv(): ObjectStorage {
  const driver = env.get('OBJECT_STORAGE_DRIVER')
  if (driver === 'fs') {
    const root = env.get('MEDIA_LOCAL_ROOT')
    if (!root) {
      throw new Error('MEDIA_LOCAL_ROOT is required when OBJECT_STORAGE_DRIVER=fs')
    }
    return new LocalObjectStorage({
      root,
      appUrl: env.get('APP_URL'),
      signingSecret: env.get('APP_KEY').release(),
    })
  }

  const accessKeyId = env.get('S3_ACCESS_KEY_ID')
  const secretAccessKey = env.get('S3_SECRET_ACCESS_KEY')
  const region = env.get('S3_REGION')
  const bucket = env.get('S3_BUCKET')
  const endpoint = env.get('S3_ENDPOINT')
  if (!accessKeyId || !secretAccessKey || !region || !bucket || !endpoint) {
    throw new Error(
      'S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_BUCKET, and S3_ENDPOINT are required when OBJECT_STORAGE_DRIVER=s3'
    )
  }

  return new S3ObjectStorage({
    region,
    bucket,
    accessKeyId,
    secretAccessKey: secretAccessKey.release(),
    endpoint,
    forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? true,
  })
}
