import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { MediaAssetSource } from '#lib/media/types'

export type MediaAssetRow = {
  id: string
  organizationId: string
  fileName: string
  filePath: string
  deliveryUrl: string
  storageKey: string
  storageDisk: string
  state: string
  source: string
  mimeType: string
  fileSize: number
  checksum: string | null
  uploadedBy: string | null
  uploadedAt: Date | string
  createdAt: Date | string
  updatedAt: Date | string
}

type Db = typeof db | TransactionClientContract

export type InsertPendingMediaAssetParams = {
  id: string
  organizationId: string
  fileName: string
  mimeType: string
  fileSize: number
  storageKey: string
  deliveryUrl: string
  storageDisk: string
  source: MediaAssetSource
  uploadedBy: string | null
}

/**
 * Tenant-scoped media_assets persistence. Callers must run inside runWithTenant.
 */
export class MediaAssetRepository {
  async insertPending(
    params: InsertPendingMediaAssetParams,
    client: Db = db
  ): Promise<MediaAssetRow> {
    const now = new Date()
    const [row] = await client
      .table('media_assets')
      .insert({
        id: params.id,
        organizationId: params.organizationId,
        fileName: params.fileName,
        filePath: params.deliveryUrl,
        deliveryUrl: params.deliveryUrl,
        storageKey: params.storageKey,
        storageDisk: params.storageDisk,
        state: 'pending_upload',
        source: params.source,
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        checksum: null,
        uploadedBy: params.uploadedBy,
        uploadedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning('*')

    return mapRow(row)
  }

  async findByIdForOrg(
    params: { organizationId: string; mediaAssetId: string },
    client: Db = db
  ): Promise<MediaAssetRow | null> {
    const row = await client
      .from('media_assets')
      .where('id', params.mediaAssetId)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapRow(row) : null
  }

  async markReady(
    params: {
      organizationId: string
      mediaAssetId: string
      fileSize: number
      checksum?: string | null
    },
    client: Db = db
  ): Promise<MediaAssetRow | null> {
    const now = new Date()
    const [row] = await client
      .from('media_assets')
      .where('id', params.mediaAssetId)
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .update({
        state: 'ready',
        fileSize: params.fileSize,
        checksum: params.checksum ?? null,
        uploadedAt: now,
        updatedAt: now,
      })
      .returning('*')

    return row ? mapRow(row) : null
  }

  async markFailed(
    params: { organizationId: string; mediaAssetId: string },
    client: Db = db
  ): Promise<void> {
    await client
      .from('media_assets')
      .where('id', params.mediaAssetId)
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .update({
        state: 'failed',
        updatedAt: new Date(),
      })
  }

  async listExpiredPending(params: {
    organizationId: string
    olderThan: Date
    limit: number
  }): Promise<MediaAssetRow[]> {
    const rows = await db
      .from('media_assets')
      .where('organizationId', params.organizationId)
      .where('state', 'pending_upload')
      .where('createdAt', '<', params.olderThan)
      .orderBy('createdAt', 'asc')
      .limit(params.limit)
      .select('*')

    return rows.map(mapRow)
  }
}

function mapRow(row: Record<string, unknown>): MediaAssetRow {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    fileName: row.fileName as string,
    filePath: row.filePath as string,
    deliveryUrl: row.deliveryUrl as string,
    storageKey: row.storageKey as string,
    storageDisk: row.storageDisk as string,
    state: row.state as string,
    source: row.source as string,
    mimeType: row.mimeType as string,
    fileSize: Number(row.fileSize ?? 0),
    checksum: (row.checksum as string | null) ?? null,
    uploadedBy: (row.uploadedBy as string | null) ?? null,
    uploadedAt: row.uploadedAt as Date | string,
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  }
}
