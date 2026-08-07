import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { OrganizationStorageObjectRepository } from '#repositories/organization_storage_object_repository'
import { MediaAssetService } from '#services/media_asset_service'
import { StorageQuotaService } from '#services/storage_quota_service'
import { runWithTenant } from '#services/tenant_context'

/**
 * Background storage lifecycle: pending expiry, soft-delete purge, delete retry, quota reconcile.
 */
export class StorageLifecycleService {
  constructor(
    private media: MediaAssetService = new MediaAssetService(),
    private storageObjects: OrganizationStorageObjectRepository = new OrganizationStorageObjectRepository(),
    private quota: StorageQuotaService = new StorageQuotaService()
  ) {}

  async expirePendingUploads(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ expired: number; scannedOrganizations: number }> {
    return this.media.expirePendingUploads(params)
  }

  async purgeDueSoftDeletes(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ purged: number; failed: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 100
    const organizationIds = await this.#organizationIds(params?.organizationId)
    let purged = 0
    let failed = 0
    let remaining = limit
    const now = new Date()

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const due = await runWithTenant(organizationId, () =>
        this.storageObjects.listDueForPurge({
          organizationId,
          now,
          limit: remaining,
        })
      )

      for (const object of due) {
        const ok = await this.media.purgeStorageObject({
          organizationId,
          storageObjectId: object.id,
        })
        if (ok) {
          purged += 1
        } else {
          failed += 1
        }
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return { purged, failed, scannedOrganizations: organizationIds.length }
  }

  async retryFailedDeletes(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ retried: number; succeeded: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 50
    const organizationIds = await this.#organizationIds(params?.organizationId)
    let retried = 0
    let succeeded = 0
    let remaining = limit

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const rows = await runWithTenant(organizationId, () =>
        this.storageObjects.listFailedDeletes({
          organizationId,
          limit: remaining,
        })
      )

      for (const object of rows) {
        retried += 1
        remaining -= 1
        const ok = await this.media.purgeStorageObject({
          organizationId,
          storageObjectId: object.id,
        })
        if (ok) {
          succeeded += 1
        }
        if (remaining <= 0) break
      }
    }

    return { retried, succeeded, scannedOrganizations: organizationIds.length }
  }

  async reconcileQuota(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ reconciled: number; scannedOrganizations: number }> {
    const organizationIds = await this.#organizationIds(params?.organizationId)
    const limit = params?.limit ?? organizationIds.length
    let reconciled = 0

    for (const organizationId of organizationIds.slice(0, limit)) {
      const result = await this.quota.reconcile(organizationId)
      logger.info(
        { organizationId, readyBytes: result.readyBytes, reservedBytes: result.reservedBytes },
        'storage.quota.reconciled'
      )
      reconciled += 1
    }

    return { reconciled, scannedOrganizations: organizationIds.length }
  }

  async #organizationIds(organizationId?: string): Promise<string[]> {
    if (organizationId) {
      return [organizationId]
    }
    const rows = await db.from('organizations').select('id')
    return rows.map((row) => row.id as string)
  }
}
