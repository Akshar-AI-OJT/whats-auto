import type { ApplicationService } from '@adonisjs/core/types'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import S3ObjectStorage from '#services/object_storage/drivers/s3_object_storage'
import env from '#start/env'

/**
 * Binds ObjectStorage to the S3 driver for media direct-upload / verify / delete.
 */
export default class ObjectStorageProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ObjectStorage, () => {
      return new S3ObjectStorage({
        region: env.get('AWS_REGION'),
        bucket: env.get('S3_BUCKET'),
        accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY').release(),
      })
    })
  }
}
