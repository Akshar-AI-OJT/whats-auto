import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type OrganizationStorageUsageRow = {
  organizationId: string
  readyBytes: number
  reservedBytes: number
  createdAt: Date | string
  updatedAt: Date | string
}

type Db = typeof db | TransactionClientContract

/**
 * Atomic org storage quota counters. Callers must run inside runWithTenant.
 */
export class OrganizationStorageUsageRepository {
  async ensureRow(organizationId: string, client: Db = db): Promise<OrganizationStorageUsageRow> {
    const existing = await client
      .from('organization_storage_usages')
      .where('organizationId', organizationId)
      .first()

    if (existing) {
      return mapRow(existing)
    }

    const now = new Date()
    const [row] = await client
      .table('organization_storage_usages')
      .insert({
        organizationId,
        readyBytes: 0,
        reservedBytes: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict('organizationId')
      .ignore()
      .returning('*')

    if (row) {
      return mapRow(row)
    }

    const again = await client
      .from('organization_storage_usages')
      .where('organizationId', organizationId)
      .first()
    return mapRow(again!)
  }

  async get(organizationId: string, client: Db = db): Promise<OrganizationStorageUsageRow | null> {
    const row = await client
      .from('organization_storage_usages')
      .where('organizationId', organizationId)
      .first()
    return row ? mapRow(row) : null
  }

  /**
   * Reserve bytes if ready+reserved+bytes <= limit. Returns updated row or null on insufficient.
   */
  async tryReserve(
    params: { organizationId: string; bytes: number; limitBytes: number },
    client: Db = db
  ): Promise<OrganizationStorageUsageRow | null> {
    await this.ensureRow(params.organizationId, client)
    const now = new Date()
    const [row] = await client
      .from('organization_storage_usages')
      .where('organizationId', params.organizationId)
      .whereRaw('"readyBytes" + "reservedBytes" + ? <= ?', [params.bytes, params.limitBytes])
      .update({
        reservedBytes: client.raw('"reservedBytes" + ?', [params.bytes]),
        updatedAt: now,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async confirmReservation(
    params: { organizationId: string; bytes: number },
    client: Db = db
  ): Promise<void> {
    await client
      .from('organization_storage_usages')
      .where('organizationId', params.organizationId)
      .where('reservedBytes', '>=', params.bytes)
      .update({
        reservedBytes: client.raw('"reservedBytes" - ?', [params.bytes]),
        readyBytes: client.raw('"readyBytes" + ?', [params.bytes]),
        updatedAt: new Date(),
      })
  }

  async releaseReservation(
    params: { organizationId: string; bytes: number },
    client: Db = db
  ): Promise<void> {
    await client
      .from('organization_storage_usages')
      .where('organizationId', params.organizationId)
      .where('reservedBytes', '>=', params.bytes)
      .update({
        reservedBytes: client.raw('"reservedBytes" - ?', [params.bytes]),
        updatedAt: new Date(),
      })
  }

  async releaseReady(
    params: { organizationId: string; bytes: number },
    client: Db = db
  ): Promise<void> {
    await client
      .from('organization_storage_usages')
      .where('organizationId', params.organizationId)
      .where('readyBytes', '>=', params.bytes)
      .update({
        readyBytes: client.raw('"readyBytes" - ?', [params.bytes]),
        updatedAt: new Date(),
      })
  }

  async setCounters(
    params: { organizationId: string; readyBytes: number; reservedBytes: number },
    client: Db = db
  ): Promise<OrganizationStorageUsageRow> {
    await this.ensureRow(params.organizationId, client)
    const [row] = await client
      .from('organization_storage_usages')
      .where('organizationId', params.organizationId)
      .update({
        readyBytes: params.readyBytes,
        reservedBytes: params.reservedBytes,
        updatedAt: new Date(),
      })
      .returning('*')

    return mapRow(row!)
  }
}

function mapRow(row: Record<string, unknown>): OrganizationStorageUsageRow {
  return {
    organizationId: row.organizationId as string,
    readyBytes: Number(row.readyBytes ?? 0),
    reservedBytes: Number(row.reservedBytes ?? 0),
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  }
}
