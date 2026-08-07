import MediaException from '#exceptions/media_exception'
import { DEFAULT_STORAGE_BYTES_LIMIT, STORAGE_BYTES_LIMIT_KEY } from '#lib/media/storage_types'
import { OrganizationStorageUsageRepository } from '#repositories/organization_storage_usage_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import { runWithTenant } from '#services/tenant_context'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'

type Db = typeof db | TransactionClientContract

/**
 * Atomic storage quota: reserve before presign, confirm on ready, release on fail/purge.
 * Soft-deleted objects keep readyBytes until hard purge.
 */
export class StorageQuotaService {
  constructor(
    private usageRepo: OrganizationStorageUsageRepository = new OrganizationStorageUsageRepository(),
    private entitlements: EntitlementService = new EntitlementService()
  ) {}

  async getLimitBytes(organizationId: string): Promise<number> {
    const limit = await this.entitlements.getNumericLimit(organizationId, STORAGE_BYTES_LIMIT_KEY)
    return limit ?? DEFAULT_STORAGE_BYTES_LIMIT
  }

  async getUsage(organizationId: string) {
    return runWithTenant(organizationId, () => this.usageRepo.ensureRow(organizationId))
  }

  async reserve(params: { organizationId: string; bytes: number }, client?: Db): Promise<void> {
    const limitBytes = await this.getLimitBytes(params.organizationId)
    const run = async (trx: Db) => {
      const updated = await this.usageRepo.tryReserve(
        {
          organizationId: params.organizationId,
          bytes: params.bytes,
          limitBytes,
        },
        trx
      )
      if (!updated) {
        throw MediaException.quotaExceeded(limitBytes)
      }
    }

    if (client) {
      await run(client)
      return
    }

    await runWithTenant(params.organizationId, () => run(db))
  }

  async confirm(params: { organizationId: string; bytes: number }, client?: Db): Promise<void> {
    const run = (trx: Db) =>
      this.usageRepo.confirmReservation(
        { organizationId: params.organizationId, bytes: params.bytes },
        trx
      )

    if (client) {
      await run(client)
      return
    }

    await runWithTenant(params.organizationId, () => run(db))
  }

  async releaseReservation(
    params: { organizationId: string; bytes: number },
    client?: Db
  ): Promise<void> {
    const run = (trx: Db) =>
      this.usageRepo.releaseReservation(
        { organizationId: params.organizationId, bytes: params.bytes },
        trx
      )

    if (client) {
      await run(client)
      return
    }

    await runWithTenant(params.organizationId, () => run(db))
  }

  async releaseReady(
    params: { organizationId: string; bytes: number },
    client?: Db
  ): Promise<void> {
    const run = (trx: Db) =>
      this.usageRepo.releaseReady(
        { organizationId: params.organizationId, bytes: params.bytes },
        trx
      )

    if (client) {
      await run(client)
      return
    }

    await runWithTenant(params.organizationId, () => run(db))
  }

  async reconcile(organizationId: string): Promise<{
    readyBytes: number
    reservedBytes: number
  }> {
    const { OrganizationStorageObjectRepository } =
      await import('#repositories/organization_storage_object_repository')
    const objects = new OrganizationStorageObjectRepository()

    return runWithTenant(organizationId, async () => {
      const readyBytes = await objects.sumRetainedBytes(organizationId)
      const reservedBytes = await objects.sumReservedBytes(organizationId)
      await this.usageRepo.setCounters({ organizationId, readyBytes, reservedBytes })
      return { readyBytes, reservedBytes }
    })
  }
}
