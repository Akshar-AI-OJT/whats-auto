import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type MediaAssetReferenceOwnerType =
  'message' | 'draft' | 'scheduled_message' | 'campaign' | 'template'

export type MediaAssetReferenceRow = {
  id: string
  organizationId: string
  mediaAssetId: string
  ownerType: string
  ownerId: string
  protectedUntil: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

type Db = typeof db | TransactionClientContract

/**
 * Protected Media Library references. Callers must run inside runWithTenant.
 */
export class MediaAssetReferenceRepository {
  async upsert(
    params: {
      organizationId: string
      mediaAssetId: string
      ownerType: MediaAssetReferenceOwnerType
      ownerId: string
      protectedUntil?: Date | null
    },
    client: Db = db
  ): Promise<MediaAssetReferenceRow> {
    const now = new Date()
    const [row] = await client
      .table('media_asset_references')
      .insert({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        protectedUntil: params.protectedUntil ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict(['ownerType', 'ownerId', 'mediaAssetId'])
      .merge({
        protectedUntil: params.protectedUntil ?? null,
        updatedAt: now,
      })
      .returning('*')

    return mapRow(row)
  }

  async remove(
    params: {
      organizationId: string
      mediaAssetId: string
      ownerType: MediaAssetReferenceOwnerType
      ownerId: string
    },
    client: Db = db
  ): Promise<void> {
    await client
      .from('media_asset_references')
      .where('organizationId', params.organizationId)
      .where('mediaAssetId', params.mediaAssetId)
      .where('ownerType', params.ownerType)
      .where('ownerId', params.ownerId)
      .delete()
  }

  async hasLiveReferences(
    params: { organizationId: string; mediaAssetId: string; now?: Date },
    client: Db = db
  ): Promise<boolean> {
    const now = params.now ?? new Date()
    const row = await client
      .from('media_asset_references')
      .where('organizationId', params.organizationId)
      .where('mediaAssetId', params.mediaAssetId)
      .where((q) => {
        q.whereNull('protectedUntil').orWhere('protectedUntil', '>', now)
      })
      .first()

    return Boolean(row)
  }

  async countLiveReferences(
    params: { organizationId: string; mediaAssetId: string; now?: Date },
    client: Db = db
  ): Promise<number> {
    const now = params.now ?? new Date()
    const row = await client
      .from('media_asset_references')
      .where('organizationId', params.organizationId)
      .where('mediaAssetId', params.mediaAssetId)
      .where((q) => {
        q.whereNull('protectedUntil').orWhere('protectedUntil', '>', now)
      })
      .count('* as total')
      .first()

    return Number(row?.total ?? 0)
  }
}

function mapRow(row: Record<string, unknown>): MediaAssetReferenceRow {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    mediaAssetId: row.mediaAssetId as string,
    ownerType: row.ownerType as string,
    ownerId: row.ownerId as string,
    protectedUntil: (row.protectedUntil as Date | string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  }
}
