import type { ApplicationService } from '@adonisjs/core/types'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import { createObjectStorageFromEnv } from '#services/object_storage/create_object_storage_from_env'

/**
 * Binds ObjectStorage (local disk or S3-compatible) for media / knowledge uploads.
 */
export default class ObjectStorageProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ObjectStorage, () => createObjectStorageFromEnv())
  }
}
