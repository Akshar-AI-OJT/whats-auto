import app from '@adonisjs/core/services/app'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import {
  assertContactImportStorageKey,
  buildContactImportStorageKey,
  uniqueContactImportStorageKey,
} from '#lib/organization_storage_path'

/**
 * Org-scoped contact-import CSV helpers on top of ObjectStorage
 * (the source of truth for all organization uploads).
 */
export class ContactImportStorage {
  constructor(private storage?: ObjectStorage) {}

  async #objectStorage(): Promise<ObjectStorage> {
    if (this.storage) return this.storage
    return app.container.make(ObjectStorage)
  }

  async putText(key: string, contents: string, contentType = 'text/csv'): Promise<void> {
    const storage = await this.#objectStorage()
    await storage.writeObject({
      key,
      body: Buffer.from(contents, 'utf8'),
      contentType,
    })
  }

  async getText(key: string): Promise<string> {
    const storage = await this.#objectStorage()
    const body = await storage.getObject(key)
    if (!body) {
      throw new Error(`Contact import file not found: ${key}`)
    }
    return Buffer.from(body).toString('utf8')
  }

  async exists(key: string): Promise<boolean> {
    const storage = await this.#objectStorage()
    return storage.objectExists(key)
  }

  async getContactImportCsv(organizationId: string, key: string): Promise<string> {
    const scoped = assertContactImportStorageKey(organizationId, key)
    return this.getText(scoped)
  }

  /**
   * Prefer the original sanitized name. If that key is already used, append
   * importId so another import's file is not overwritten.
   */
  async allocateContactImportKey(
    organizationId: string,
    originalFileName: string,
    uniqueSuffix: string
  ): Promise<string> {
    const preferred = buildContactImportStorageKey(organizationId, originalFileName)
    if (!(await this.exists(preferred))) {
      return preferred
    }
    return uniqueContactImportStorageKey(organizationId, originalFileName, uniqueSuffix)
  }
}
