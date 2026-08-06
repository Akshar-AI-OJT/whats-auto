import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import MediaException from '#exceptions/media_exception'
import { buildMediaDeliveryUrl } from '#lib/media/delivery_url'
import { buildMediaStorageKey } from '#lib/media/storage_key'
import { MediaAssetSource, MediaAssetState } from '#lib/media/types'
import {
  normalizeMimeType,
  OUTBOUND_MEDIA_MAX_BYTES,
  tenantOutboundMediaTypeForMime,
} from '#lib/meta_whatsapp/outbound_media'
import { MediaAssetRepository, type MediaAssetRow } from '#repositories/media_asset_repository'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import type { PresignedUpload } from '#services/object_storage/contracts/object_storage'
import { runWithTenant } from '#services/tenant_context'
import env from '#start/env'

/** Presigned upload lifetime — orphan cleanup uses the same window. */
export const MEDIA_UPLOAD_PRESIGN_SECONDS = 15 * 60

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
}

export type InitiateUploadResult = {
  asset: MediaAssetDto
  upload: PresignedUpload
}

/**
 * Org media library: initiate direct-to-S3 upload and complete verification.
 * Storage I/O stays outside DB transactions.
 */
export class MediaAssetService {
  constructor(
    private repo: MediaAssetRepository = new MediaAssetRepository(),
    private storage?: ObjectStorage
  ) {}

  async initiateUpload(params: {
    organizationId: string
    uploadedBy: string | null
    fileName: string
    mimeType: string
    fileSize: number
  }): Promise<InitiateUploadResult> {
    const mimeType = normalizeMimeType(params.mimeType)
    const mediaType = tenantOutboundMediaTypeForMime(mimeType)
    if (!mediaType) {
      throw MediaException.unsupportedMimeType()
    }
    if (params.fileSize > OUTBOUND_MEDIA_MAX_BYTES[mediaType]) {
      throw MediaException.fileTooLarge(OUTBOUND_MEDIA_MAX_BYTES[mediaType])
    }

    const assetId = randomUUID()
    const storageKey = buildMediaStorageKey({
      organizationId: params.organizationId,
      source: MediaAssetSource.Upload,
      mediaType,
      assetId,
      mimeType,
      fileName: params.fileName,
    })
    const deliveryUrl = buildMediaDeliveryUrl(env.get('MEDIA_PUBLIC_BASE_URL'), storageKey)

    const asset = await runWithTenant(params.organizationId, () =>
      this.repo.insertPending({
        id: assetId,
        organizationId: params.organizationId,
        fileName: params.fileName,
        mimeType,
        fileSize: params.fileSize,
        storageKey,
        deliveryUrl,
        storageDisk: env.get('DRIVE_DISK'),
        source: MediaAssetSource.Upload,
        uploadedBy: params.uploadedBy,
      })
    )

    const storage = await this.#objectStorage()
    const upload = await storage.createPresignedUpload({
      key: asset.storageKey,
      contentType: mimeType,
      contentLength: params.fileSize,
      expiresInSeconds: MEDIA_UPLOAD_PRESIGN_SECONDS,
    })

    return {
      asset: toDto(asset),
      upload,
    }
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

    const ready = await runWithTenant(params.organizationId, () =>
      this.repo.markReady({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
        fileSize: head.contentLength,
        checksum: head.eTag,
      })
    )

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
   * Expire abandoned pending uploads: delete storage objects (best effort), mark failed.
   * Iterates orgs so RLS stays correct.
   */
  async expirePendingUploads(params?: {
    organizationId?: string
    limit?: number
    olderThanMs?: number
  }): Promise<{ expired: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 100
    const olderThanMs = params?.olderThanMs ?? MEDIA_UPLOAD_PRESIGN_SECONDS * 1000
    const olderThan = new Date(Date.now() - olderThanMs)

    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : await db
          .from('organizations')
          .select('id')
          .then((rows) => rows.map((row) => row.id as string))

    let expired = 0
    let remaining = limit
    const storage = await this.#objectStorage()

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const pending = await runWithTenant(organizationId, () =>
        this.repo.listExpiredPending({
          organizationId,
          olderThan,
          limit: remaining,
        })
      )

      for (const asset of pending) {
        try {
          await storage.deleteObject(asset.storageKey)
        } catch {
          // Best-effort delete; still mark failed so we do not retry forever.
        }

        await runWithTenant(organizationId, () =>
          this.repo.markFailed({
            organizationId,
            mediaAssetId: asset.id,
          })
        )
        expired += 1
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return { expired, scannedOrganizations: organizationIds.length }
  }

  async #objectStorage(): Promise<ObjectStorage> {
    if (this.storage) return this.storage
    return app.container.make(ObjectStorage)
  }
}

function toDto(row: MediaAssetRow): MediaAssetDto {
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
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
