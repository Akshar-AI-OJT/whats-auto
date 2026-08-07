import type { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import S3ObjectStorage from '#services/object_storage/drivers/s3_object_storage'
import env from '#start/env'

/**
 * Resolves S3 object storage from env. Prefer IoC `ObjectStorage` in app code;
 * this factory is for Ace/scripts that skip the provider.
 */
export function createObjectStorageFromEnv(): ObjectStorage {
  return new S3ObjectStorage({
    region: env.get('AWS_REGION'),
    bucket: env.get('S3_BUCKET'),
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY').release(),
  })
}
