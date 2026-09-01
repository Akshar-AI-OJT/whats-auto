import drive from '@adonisjs/drive/services/main'
import {
  assertContactImportStorageKey,
  buildContactImportStorageKey,
  uniqueContactImportStorageKey,
} from '#lib/organization_storage_path'

/**
 * Thin wrapper over Adonis Drive (local fs or S3). Object keys use the
 * organization folder layout; the disk itself is the configured Drive default.
 */
export class ObjectStorageService {
  async putText(key: string, contents: string, contentType = 'text/csv'): Promise<void> {
    await drive.use().put(key, contents, { contentType })
  }

  async getText(key: string): Promise<string> {
    return drive.use().get(key)
  }

  async exists(key: string): Promise<boolean> {
    return drive.use().exists(key)
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
