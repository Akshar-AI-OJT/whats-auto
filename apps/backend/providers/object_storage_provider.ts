import type { ApplicationService } from '@adonisjs/core/types'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import S3ObjectStorage from '#services/object_storage/drivers/s3_object_storage'
import env from '#start/env'

/**
 * Binds ObjectStorage to Contabo Object Storage (S3-compatible) for media uploads.
 */
export default class ObjectStorageProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ObjectStorage, () => {
      return new S3ObjectStorage({
        region: env.get('S3_REGION'),
        bucket: env.get('S3_BUCKET'),
        accessKeyId: env.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: env.get('S3_SECRET_ACCESS_KEY').release(),
        endpoint: env.get('S3_ENDPOINT'),
        forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? true,
      })
    })
  }
}
