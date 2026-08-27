import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type {
  StorageNamespace,
  StorageOwnerType,
  StorageProvenance,
  StorageRetentionPolicy,
} from '#lib/media/storage_types'

export type OrganizationStorageObjectRow = {
  id: string
  organizationId: string
  storageKey: string
  storageDisk: string
  namespace: string
  ownerType: string
  ownerId: string | null
  mimeType: string
  sizeBytes: number
  checksum: string | null
  state: string
  retentionPolicy: string
  provenance: string
  keyVersion: number
  deletedAt: Date | string | null
  purgeAfter: Date | string | null
  purgedAt: Date | string | null
  deleteAttempts: number
  lastDeleteErrorAt: Date | string | null
  lastDeleteError: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

type Db = typeof db | TransactionClientContract

export type InsertPendingStorageObjectParams = {
  id: string
  organizationId: string
  storageKey: string
  storageDisk: string
  namespace: StorageNamespace
  ownerType: StorageOwnerType
  ownerId: string | null
  mimeType: string
  sizeBytes: number
  retentionPolicy: StorageRetentionPolicy
  provenance: StorageProvenance
  keyVersion: number
}

/**
 * Tenant-scoped organization_storage_objects persistence. Callers must run inside runWithTenant.
 */
export class OrganizationStorageObjectRepository {
  async insertPending(
    params: InsertPendingStorageObjectParams,
    client: Db = db
  ): Promise<OrganizationStorageObjectRow> {
    const now = new Date()
    const [row] = await client
      .table('organization_storage_objects')
      .insert({
        id: params.id,
        organizationId: params.organizationId,
        storageKey: params.storageKey,
        storageDisk: params.storageDisk,
        namespace: params.namespace,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        checksum: null,
        state: 'pending_upload',
        retentionPolicy: params.retentionPolicy,
        provenance: params.provenance,
        keyVersion: params.keyVersion,
        deletedAt: null,
        purgeAfter: null,
        purgedAt: null,
        deleteAttempts: 0,
        lastDeleteErrorAt: null,
        lastDeleteError: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning('*')

    return mapRow(row)
  }

  async findByIdForOrg(
    params: { organizationId: string; storageObjectId: string },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const row = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapRow(row) : null
  }

  async markReady(
    params: {
      organizationId: string
      storageObjectId: string
      sizeBytes: number
      checksum?: string | null
    },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const now = new Date()
    const [row] = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .update({
        state: 'ready',
        sizeBytes: params.sizeBytes,
        checksum: params.checksum ?? null,
        updatedAt: now,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async markFailed(
    params: { organizationId: string; storageObjectId: string },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const [row] = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .update({
        state: 'failed',
        updatedAt: new Date(),
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async softDelete(
    params: {
      organizationId: string
      storageObjectId: string
      purgeAfter: Date
    },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const now = new Date()
    const [row] = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .where('state', 'ready')
      .update({
        state: 'deleted',
        deletedAt: now,
        purgeAfter: params.purgeAfter,
        updatedAt: now,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  /**
   * Free a canonical storage key (e.g. profile logo) so a replacement upload can
   * insert under the same key. Renames prior rows off the unique index.
   */
  async retireStorageKey(
    params: { organizationId: string; storageKey: string; purgeAfter: Date },
    client: Db = db
  ): Promise<void> {
    const now = new Date()
    const rows = await client
      .from('organization_storage_objects')
      .where('organizationId', params.organizationId)
      .where('storageKey', params.storageKey)
      .select('id')

    for (const row of rows) {
      const id = row.id as string
      await client
        .from('organization_storage_objects')
        .where('id', id)
        .where('organizationId', params.organizationId)
        .update({
          storageKey: `${params.storageKey}.replaced.${id}`,
          state: 'deleted',
          deletedAt: now,
          purgeAfter: params.purgeAfter,
          updatedAt: now,
        })
    }
  }

  async restore(
    params: { organizationId: string; storageObjectId: string },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const now = new Date()
    const [row] = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .where('state', 'deleted')
      .whereNull('purgedAt')
      .update({
        state: 'ready',
        deletedAt: null,
        purgeAfter: null,
        updatedAt: now,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async markPurged(
    params: { organizationId: string; storageObjectId: string },
    client: Db = db
  ): Promise<OrganizationStorageObjectRow | null> {
    const now = new Date()
    const [row] = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .whereIn('state', ['deleted', 'failed', 'pending_upload'])
      .update({
        state: 'purged',
        purgedAt: now,
        updatedAt: now,
        lastDeleteError: null,
        lastDeleteErrorAt: null,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async recordDeleteFailure(
    params: {
      organizationId: string
      storageObjectId: string
      errorMessage: string
    },
    client: Db = db
  ): Promise<void> {
    const existing = await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .first()
    if (!existing) {
      return
    }

    const now = new Date()
    await client
      .from('organization_storage_objects')
      .where('id', params.storageObjectId)
      .where('organizationId', params.organizationId)
      .update({
        deleteAttempts: Number(existing.deleteAttempts ?? 0) + 1,
        lastDeleteErrorAt: now,
        lastDeleteError: params.errorMessage.slice(0, 2000),
        updatedAt: now,
      })
  }

  async listExpiredPending(params: {
    organizationId: string
    olderThan: Date
    limit: number
  }): Promise<OrganizationStorageObjectRow[]> {
    const rows = await db
      .from('organization_storage_objects')
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .where('createdAt', '<', params.olderThan)
      .orderBy('createdAt', 'asc')
      .limit(params.limit)
      .select('*')

    return rows.map(mapRow)
  }

  async listDueForPurge(params: {
    organizationId: string
    now: Date
    limit: number
  }): Promise<OrganizationStorageObjectRow[]> {
    const rows = await db
      .from('organization_storage_objects')
      .where('organizationId', params.organizationId)
      .where('state', 'deleted')
      .whereNotNull('purgeAfter')
      .where('purgeAfter', '<=', params.now)
      .whereNull('purgedAt')
      .orderBy('purgeAfter', 'asc')
      .limit(params.limit)
      .select('*')

    return rows.map(mapRow)
  }

  async listFailedDeletes(params: {
    organizationId: string
    limit: number
  }): Promise<OrganizationStorageObjectRow[]> {
    const rows = await db
      .from('organization_storage_objects')
      .where('organizationId', params.organizationId)
      .whereIn('state', ['deleted', 'failed'])
      .where('deleteAttempts', '>', 0)
      .whereNotNull('lastDeleteErrorAt')
      .whereNull('purgedAt')
      .orderBy('lastDeleteErrorAt', 'asc')
      .limit(params.limit)
      .select('*')

    return rows.map(mapRow)
  }

  async sumRetainedBytes(organizationId: string, client: Db = db): Promise<number> {
    const row = await client
      .from('organization_storage_objects')
      .where('organizationId', organizationId)
      .whereIn('state', ['ready', 'deleted'])
      .sum('sizeBytes as total')
      .first()

    return Number(row?.total ?? 0)
  }

  async sumReservedBytes(organizationId: string, client: Db = db): Promise<number> {
    const row = await client
      .from('organization_storage_objects')
      .where('organizationId', organizationId)
      .where('state', 'pending_upload')
      .sum('sizeBytes as total')
      .first()

    return Number(row?.total ?? 0)
  }
}

function mapRow(row: Record<string, unknown>): OrganizationStorageObjectRow {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    storageKey: row.storageKey as string,
    storageDisk: row.storageDisk as string,
    namespace: row.namespace as string,
    ownerType: row.ownerType as string,
    ownerId: (row.ownerId as string | null) ?? null,
    mimeType: row.mimeType as string,
    sizeBytes: Number(row.sizeBytes ?? 0),
    checksum: (row.checksum as string | null) ?? null,
    state: row.state as string,
    retentionPolicy: row.retentionPolicy as string,
    provenance: row.provenance as string,
    keyVersion: Number(row.keyVersion ?? 1),
    deletedAt: (row.deletedAt as Date | string | null) ?? null,
    purgeAfter: (row.purgeAfter as Date | string | null) ?? null,
    purgedAt: (row.purgedAt as Date | string | null) ?? null,
    deleteAttempts: Number(row.deleteAttempts ?? 0),
    lastDeleteErrorAt: (row.lastDeleteErrorAt as Date | string | null) ?? null,
    lastDeleteError: (row.lastDeleteError as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  }
}
