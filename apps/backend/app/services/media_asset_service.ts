import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import MediaException from '#exceptions/media_exception'
import { buildMediaDeliveryUrl } from '#lib/media/delivery_url'
import {
  buildOrganizationStorageKey,
  retentionForNamespace,
} from '#lib/media/organization_storage_key'
import {
  STORAGE_PENDING_UPLOAD_TTL_MS,
  STORAGE_SOFT_DELETE_GRACE_MS,
  StorageNamespace,
  StorageObjectState,
  StorageOwnerType,
  StorageProvenance,
} from '#lib/media/storage_types'
import { MediaAssetSource, MediaAssetState } from '#lib/media/types'
import {
  normalizeMimeType,
  OUTBOUND_MEDIA_MAX_BYTES,
  tenantOutboundMediaTypeForMime,
} from '#lib/meta_whatsapp/outbound_media'
import { MediaAssetRepository, type MediaAssetRow } from '#repositories/media_asset_repository'
import {
  MediaAssetReferenceRepository,
  type MediaAssetReferenceOwnerType,
} from '#repositories/media_asset_reference_repository'
import { OrganizationStorageObjectRepository } from '#repositories/organization_storage_object_repository'
import { ContentInspection } from '#services/content_inspection/contracts/content_inspection'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import type { PresignedUpload } from '#services/object_storage/contracts/object_storage'
import { StorageQuotaService } from '#services/storage_quota_service'
import { runWithTenant } from '#services/tenant_context'
import env from '#start/env'
import { verifyMediaUploadSignature } from '#lib/media/media_upload_signature'

/** Presigned upload lifetime — orphan cleanup uses a longer 24h window. */
export const MEDIA_UPLOAD_PRESIGN_SECONDS = 15 * 60

/** Pending orphan TTL (database cleanup), independent of presign expiry. */
export const MEDIA_PENDING_UPLOAD_TTL_MS = STORAGE_PENDING_UPLOAD_TTL_MS

const CONTENT_INSPECTION_PREFIX_BYTES = 16

export type MediaAssetDto = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  state: string
  source: string
  deliveryUrl: string
  uploadedAt: string
  createdAt: string
  kind: 'image' | 'document'
  referenceCount?: number
}

export type MediaLibraryListResult = {
  data: MediaAssetDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export type MediaQuotaDto = {
  readyBytes: number
  reservedBytes: number
  limitBytes: number
  usedBytes: number
}

export type InitiateUploadResult = {
  asset: MediaAssetDto
  upload: PresignedUpload
}

/**
 * Org media library: initiate direct-to-S3 upload and complete verification.
 * Creates organization_storage_objects + media_assets; quota reserved before presign.
 * Storage I/O stays outside DB transactions.
 */
export class MediaAssetService {
  constructor(
    private repo: MediaAssetRepository = new MediaAssetRepository(),
    private storageObjects: OrganizationStorageObjectRepository = new OrganizationStorageObjectRepository(),
    private quota: StorageQuotaService = new StorageQuotaService(),
    private references: MediaAssetReferenceRepository = new MediaAssetReferenceRepository(),
    private storage?: ObjectStorage,
    private inspection?: ContentInspection
  ) {}

  async listLibrary(params: {
    organizationId: string
    page?: number
    perPage?: number
    state?: string
    kind?: 'image' | 'document'
    search?: string
  }): Promise<MediaLibraryListResult> {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20

    const { rows, total } = await runWithTenant(params.organizationId, () =>
      this.repo.listForLibrary({
        organizationId: params.organizationId,
        page,
        perPage,
        state: params.state,
        kind: params.kind,
        search: params.search,
      })
    )

    const data: MediaAssetDto[] = []
    for (const row of rows) {
      const referenceCount = await runWithTenant(params.organizationId, () =>
        this.references.countLiveReferences({
          organizationId: params.organizationId,
          mediaAssetId: row.id,
        })
      )
      data.push(toDto(row, referenceCount))
    }

    const lastPage = Math.ceil(total / perPage) || 1
    return {
      data,
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage,
      },
    }
  }

  async getLibraryAsset(params: {
    organizationId: string
    mediaAssetId: string
  }): Promise<MediaAssetDto> {
    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )
    if (
      !asset ||
      asset.state === MediaAssetState.PendingUpload ||
      asset.state === MediaAssetState.Failed
    ) {
      throw MediaException.notFound()
    }

    const referenceCount = await runWithTenant(params.organizationId, () =>
      this.references.countLiveReferences({
        organizationId: params.organizationId,
        mediaAssetId: asset.id,
      })
    )
    return toDto(asset, referenceCount)
  }

  /** Ready organization profile logo, or null when none uploaded. */
  async getOrganizationLogo(params: { organizationId: string }): Promise<MediaAssetDto | null> {
    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.findReadyProfileLogo({ organizationId: params.organizationId })
    )
    return asset ? toDto(asset) : null
  }

  async getQuota(organizationId: string): Promise<MediaQuotaDto> {
    const [usage, limitBytes] = await Promise.all([
      this.quota.getUsage(organizationId),
      this.quota.getLimitBytes(organizationId),
    ])
    return {
      readyBytes: usage.readyBytes,
      reservedBytes: usage.reservedBytes,
      limitBytes,
      usedBytes: usage.readyBytes + usage.reservedBytes,
    }
  }

  async registerReference(params: {
    organizationId: string
    mediaAssetId: string
    ownerType: MediaAssetReferenceOwnerType
    ownerId: string
    protectedUntil?: Date | null
  }): Promise<void> {
    await runWithTenant(params.organizationId, () =>
      this.references.upsert({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        protectedUntil: params.protectedUntil,
      })
    )
  }

  async clearReference(params: {
    organizationId: string
    mediaAssetId: string
    ownerType: MediaAssetReferenceOwnerType
    ownerId: string
  }): Promise<void> {
    await runWithTenant(params.organizationId, () =>
      this.references.remove({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
      })
    )
  }
  async initiateUpload(params: {
    organizationId: string
    uploadedBy: string | null
    fileName: string
    mimeType: string
    fileSize: number
    namespace?: StorageNamespace
  }): Promise<InitiateUploadResult> {
    const mimeType = normalizeMimeType(params.mimeType)
    const mediaType = tenantOutboundMediaTypeForMime(mimeType)
    if (!mediaType) {
      throw MediaException.unsupportedMimeType()
    }
    if (params.fileSize > OUTBOUND_MEDIA_MAX_BYTES[mediaType]) {
      throw MediaException.fileTooLarge(OUTBOUND_MEDIA_MAX_BYTES[mediaType])
    }

    const namespace = params.namespace ?? StorageNamespace.MediaLibrary
    if (namespace === StorageNamespace.Profile && mediaType !== 'image') {
      throw MediaException.unsupportedMimeType()
    }

    const assetId = randomUUID()
    const storageObjectId = randomUUID()
    const keyVersion = 2
    const storageKey = buildOrganizationStorageKey({
      organizationId: params.organizationId,
      namespace,
      mediaType,
      assetId,
      mimeType,
      fileName: params.fileName,
    })
    const deliveryUrl = buildMediaDeliveryUrl(env.get('MEDIA_PUBLIC_BASE_URL'), storageKey)
    const storageDisk = env.get('DRIVE_DISK')
    const storageOwnerType =
      namespace === StorageNamespace.Profile
        ? StorageOwnerType.OrganizationProfile
        : StorageOwnerType.MediaAsset
    const storageOwnerId = namespace === StorageNamespace.Profile ? params.organizationId : assetId

    const asset = await runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        await this.quota.reserve(
          { organizationId: params.organizationId, bytes: params.fileSize },
          trx
        )

        if (namespace === StorageNamespace.Profile) {
          const purgeAfter = new Date(Date.now() + STORAGE_SOFT_DELETE_GRACE_MS)
          await this.storageObjects.retireStorageKey(
            {
              organizationId: params.organizationId,
              storageKey,
              purgeAfter,
            },
            trx
          )
          await this.repo.retireStorageKey(
            {
              organizationId: params.organizationId,
              storageKey,
            },
            trx
          )
        }

        await this.storageObjects.insertPending(
          {
            id: storageObjectId,
            organizationId: params.organizationId,
            storageKey,
            storageDisk,
            namespace,
            ownerType: storageOwnerType,
            ownerId: storageOwnerId,
            mimeType,
            sizeBytes: params.fileSize,
            retentionPolicy: retentionForNamespace(namespace),
            provenance: StorageProvenance.Upload,
            keyVersion,
          },
          trx
        )

        return this.repo.insertPending(
          {
            id: assetId,
            organizationId: params.organizationId,
            fileName: params.fileName,
            mimeType,
            fileSize: params.fileSize,
            storageKey,
            deliveryUrl,
            storageDisk,
            storageObjectId,
            source: MediaAssetSource.Upload,
            uploadedBy: params.uploadedBy,
          },
          trx
        )
      })
    })

    try {
      const storage = await this.#objectStorage()
      const upload = await storage.createPresignedUpload({
        key: asset.storageKey,
        contentType: mimeType,
        contentLength: params.fileSize,
        expiresInSeconds: MEDIA_UPLOAD_PRESIGN_SECONDS,
        assetId: asset.id,
        organizationId: params.organizationId,
      })

      return {
        asset: toDto(asset),
        upload,
      }
    } catch (error) {
      await runWithTenant(params.organizationId, async () => {
        await db.transaction(async (trx) => {
          await this.storageObjects.markFailed(
            { organizationId: params.organizationId, storageObjectId },
            trx
          )
          await this.repo.markFailed(
            { organizationId: params.organizationId, mediaAssetId: assetId },
            trx
          )
          await this.quota.releaseReservation(
            { organizationId: params.organizationId, bytes: params.fileSize },
            trx
          )
        })
      })
      throw error
    }
  }

  /**
   * Browser PUT target for local-disk storage (HMAC URL from createPresignedUpload).
   * S3 mode never hits this route.
   */
  async putUploadContent(params: {
    mediaAssetId: string
    organizationId: string
    storageKey: string
    expiresAtUnix: number
    signature: string
    body: Uint8Array
    contentType: string | null
  }): Promise<void> {
    const valid = verifyMediaUploadSignature({
      secret: env.get('APP_KEY').release(),
      signature: params.signature,
      payload: {
        assetId: params.mediaAssetId,
        storageKey: params.storageKey,
        organizationId: params.organizationId,
        expiresAtUnix: params.expiresAtUnix,
      },
    })
    if (!valid) {
      throw MediaException.invalidUploadSignature()
    }

    const existing = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )

    if (!existing) {
      throw MediaException.notFound()
    }
    if (existing.state !== MediaAssetState.PendingUpload) {
      throw MediaException.notPending()
    }
    if (existing.storageKey !== params.storageKey) {
      throw MediaException.invalidUploadSignature()
    }
    if (params.body.byteLength !== existing.fileSize) {
      throw MediaException.uploadMismatch(
        `expected size ${existing.fileSize}, got ${params.body.byteLength}`
      )
    }

    const contentType = params.contentType
      ? normalizeMimeType(params.contentType)
      : existing.mimeType

    const storage = await this.#objectStorage()
    await storage.writeObject({
      key: existing.storageKey,
      body: params.body,
      contentType,
    })
  }

  async completeUpload(params: {
    organizationId: string
    mediaAssetId: string
  }): Promise<MediaAssetDto> {
    const existing = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )

    if (!existing) {
      throw MediaException.notFound()
    }

    if (existing.state === MediaAssetState.Ready) {
      return toDto(existing)
    }

    if (existing.state !== MediaAssetState.PendingUpload) {
      throw MediaException.notPending()
    }

    if (!existing.storageObjectId) {
      throw MediaException.notPending()
    }

    const storage = await this.#objectStorage()
    const head = await storage.headObject(existing.storageKey)
    if (!head) {
      throw MediaException.uploadIncomplete()
    }

    if (head.contentLength !== existing.fileSize) {
      throw MediaException.uploadMismatch(
        `expected size ${existing.fileSize}, got ${head.contentLength}`
      )
    }

    const actualType = head.contentType ? normalizeMimeType(head.contentType) : null
    if (actualType && actualType !== normalizeMimeType(existing.mimeType)) {
      throw MediaException.uploadMismatch(
        `expected content type ${existing.mimeType}, got ${head.contentType}`
      )
    }

    const prefix = await storage.getObjectPrefix({
      key: existing.storageKey,
      maxBytes: CONTENT_INSPECTION_PREFIX_BYTES,
    })
    const inspection = await this.#contentInspection()
    const inspected = await inspection.inspect({
      mimeType: existing.mimeType,
      prefix,
      sizeBytes: head.contentLength,
    })
    if (!inspected.ok) {
      throw MediaException.contentRejected(inspected.reason)
    }

    const ready = await runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const storageReady = await this.storageObjects.markReady(
          {
            organizationId: params.organizationId,
            storageObjectId: existing.storageObjectId!,
            sizeBytes: head.contentLength,
            checksum: head.eTag,
          },
          trx
        )
        if (!storageReady) {
          return null
        }

        const assetReady = await this.repo.markReady(
          {
            organizationId: params.organizationId,
            mediaAssetId: params.mediaAssetId,
            fileSize: head.contentLength,
            checksum: head.eTag,
          },
          trx
        )
        if (!assetReady) {
          return null
        }

        await this.quota.confirm(
          { organizationId: params.organizationId, bytes: existing.fileSize },
          trx
        )

        return assetReady
      })
    })

    if (!ready) {
      const again = await runWithTenant(params.organizationId, () =>
        this.repo.findByIdForOrg({
          organizationId: params.organizationId,
          mediaAssetId: params.mediaAssetId,
        })
      )
      if (again?.state === MediaAssetState.Ready) {
        return toDto(again)
      }
      throw MediaException.notPending()
    }

    return toDto(ready)
  }

  /**
   * Soft-delete a ready library asset. Quota stays until hard purge.
   */
  async softDelete(params: {
    organizationId: string
    mediaAssetId: string
  }): Promise<MediaAssetDto> {
    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )
    if (!asset) {
      throw MediaException.notFound()
    }
    if (asset.state !== MediaAssetState.Ready) {
      throw MediaException.notDeletable('Only ready media assets can be soft-deleted')
    }
    if (!asset.storageObjectId) {
      throw MediaException.notDeletable('Media asset has no storage object')
    }

    // Closed conversations intentionally keep message refs live — closing does
    // not release media; soft-delete stays blocked until refs are cleared otherwise.
    const hasRefs = await runWithTenant(params.organizationId, () =>
      this.references.hasLiveReferences({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )
    if (hasRefs) {
      throw MediaException.hasProtectedReferences()
    }

    const purgeAfter = new Date(Date.now() + STORAGE_SOFT_DELETE_GRACE_MS)
    const updated = await runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const storage = await this.storageObjects.softDelete(
          {
            organizationId: params.organizationId,
            storageObjectId: asset.storageObjectId!,
            purgeAfter,
          },
          trx
        )
        if (!storage) {
          return null
        }
        return this.repo.markDeleted(
          { organizationId: params.organizationId, mediaAssetId: params.mediaAssetId },
          trx
        )
      })
    })

    if (!updated) {
      throw MediaException.notDeletable('Media asset could not be deleted')
    }
    return toDto(updated)
  }

  async restore(params: { organizationId: string; mediaAssetId: string }): Promise<MediaAssetDto> {
    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )
    if (!asset) {
      throw MediaException.notFound()
    }
    if (asset.state !== MediaAssetState.Deleted) {
      throw MediaException.notRestorable()
    }
    if (!asset.storageObjectId) {
      throw MediaException.notRestorable()
    }

    const storageRow = await runWithTenant(params.organizationId, () =>
      this.storageObjects.findByIdForOrg({
        organizationId: params.organizationId,
        storageObjectId: asset.storageObjectId!,
      })
    )
    if (!storageRow || storageRow.state === StorageObjectState.Purged || storageRow.purgedAt) {
      throw MediaException.alreadyPurged()
    }

    const updated = await runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const restoredStorage = await this.storageObjects.restore(
          {
            organizationId: params.organizationId,
            storageObjectId: asset.storageObjectId!,
          },
          trx
        )
        if (!restoredStorage) {
          return null
        }
        return this.repo.markRestored(
          { organizationId: params.organizationId, mediaAssetId: params.mediaAssetId },
          trx
        )
      })
    })

    if (!updated) {
      throw MediaException.notRestorable()
    }
    return toDto(updated)
  }

  /**
   * Owner early purge or worker hard-delete: remove S3 object and release ready quota.
   */
  async purge(params: { organizationId: string; mediaAssetId: string }): Promise<void> {
    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.findByIdForOrg({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    )
    if (!asset) {
      throw MediaException.notFound()
    }
    if (!asset.storageObjectId) {
      throw MediaException.alreadyPurged()
    }

    const storageRow = await runWithTenant(params.organizationId, () =>
      this.storageObjects.findByIdForOrg({
        organizationId: params.organizationId,
        storageObjectId: asset.storageObjectId!,
      })
    )
    if (!storageRow || storageRow.state === StorageObjectState.Purged) {
      throw MediaException.alreadyPurged()
    }

    if (
      storageRow.state !== StorageObjectState.Deleted &&
      storageRow.state !== StorageObjectState.Ready
    ) {
      throw MediaException.notDeletable('Only ready or soft-deleted assets can be purged')
    }

    // Soft-delete first when still ready so state machine stays consistent.
    if (storageRow.state === StorageObjectState.Ready) {
      await this.softDelete({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
    }

    await this.#hardDeleteStorageObject({
      organizationId: params.organizationId,
      storageObjectId: asset.storageObjectId,
      storageKey: asset.storageKey,
      sizeBytes: storageRow.sizeBytes,
      releaseReadyQuota: true,
    })
  }

  /**
   * Expire abandoned pending uploads: delete storage objects (best effort), mark failed, release reserved quota.
   */
  async expirePendingUploads(params?: {
    organizationId?: string
    limit?: number
    olderThanMs?: number
  }): Promise<{ expired: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 100
    const olderThanMs = params?.olderThanMs ?? MEDIA_PENDING_UPLOAD_TTL_MS
    const olderThan = new Date(Date.now() - olderThanMs)

    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : await db
          .from('organizations')
          .whereNull('deletedAt')
          .where('status', 'active')
          .select('id')
          .then((rows) => rows.map((row) => row.id as string))

    let expired = 0
    let remaining = limit

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const pending = await runWithTenant(organizationId, () =>
        this.storageObjects.listExpiredPending({
          organizationId,
          olderThan,
          limit: remaining,
        })
      )

      for (const object of pending) {
        await this.#expirePendingObject(
          organizationId,
          object.id,
          object.storageKey,
          object.sizeBytes
        )
        expired += 1
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return { expired, scannedOrganizations: organizationIds.length }
  }

  async #expirePendingObject(
    organizationId: string,
    storageObjectId: string,
    storageKey: string,
    sizeBytes: number
  ): Promise<void> {
    const storage = await this.#objectStorage()
    try {
      await storage.deleteObject(storageKey)
    } catch {
      // Best-effort; still mark failed so reserved quota is released.
    }

    await runWithTenant(organizationId, async () => {
      await db.transaction(async (trx) => {
        const failed = await this.storageObjects.markFailed(
          { organizationId, storageObjectId },
          trx
        )
        if (!failed) {
          return
        }

        if (failed.ownerType === StorageOwnerType.MediaAsset && failed.ownerId) {
          await this.repo.markFailed({ organizationId, mediaAssetId: failed.ownerId }, trx)
        }

        await this.quota.releaseReservation({ organizationId, bytes: sizeBytes }, trx)
      })
    })
  }

  async #hardDeleteStorageObject(params: {
    organizationId: string
    storageObjectId: string
    storageKey: string
    sizeBytes: number
    releaseReadyQuota: boolean
  }): Promise<boolean> {
    const storage = await this.#objectStorage()
    try {
      await storage.deleteObject(params.storageKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await runWithTenant(params.organizationId, () =>
        this.storageObjects.recordDeleteFailure({
          organizationId: params.organizationId,
          storageObjectId: params.storageObjectId,
          errorMessage: message,
        })
      )
      return false
    }

    await runWithTenant(params.organizationId, async () => {
      await db.transaction(async (trx) => {
        const purged = await this.storageObjects.markPurged(
          {
            organizationId: params.organizationId,
            storageObjectId: params.storageObjectId,
          },
          trx
        )
        if (!purged) {
          return
        }
        if (params.releaseReadyQuota) {
          await this.quota.releaseReady(
            { organizationId: params.organizationId, bytes: params.sizeBytes },
            trx
          )
        }
      })
    })
    return true
  }

  /** Used by lifecycle worker for due soft-deletes. */
  async purgeStorageObject(params: {
    organizationId: string
    storageObjectId: string
  }): Promise<boolean> {
    const row = await runWithTenant(params.organizationId, () =>
      this.storageObjects.findByIdForOrg({
        organizationId: params.organizationId,
        storageObjectId: params.storageObjectId,
      })
    )
    if (!row || row.state === StorageObjectState.Purged) {
      return true
    }
    if (row.state !== StorageObjectState.Deleted) {
      return false
    }

    return this.#hardDeleteStorageObject({
      organizationId: params.organizationId,
      storageObjectId: row.id,
      storageKey: row.storageKey,
      sizeBytes: row.sizeBytes,
      releaseReadyQuota: true,
    })
  }

  async #objectStorage(): Promise<ObjectStorage> {
    if (this.storage) return this.storage
    return app.container.make(ObjectStorage)
  }

  async #contentInspection(): Promise<ContentInspection> {
    if (this.inspection) return this.inspection
    return app.container.make(ContentInspection)
  }
}

function toDto(row: MediaAssetRow, referenceCount?: number): MediaAssetDto {
  const mime = row.mimeType.toLowerCase()
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    state: row.state,
    source: row.source,
    deliveryUrl: row.deliveryUrl,
    uploadedAt: toIso(row.uploadedAt),
    createdAt: toIso(row.createdAt),
    kind: mime.startsWith('image/') ? 'image' : 'document',
    ...(referenceCount !== undefined ? { referenceCount } : {}),
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
