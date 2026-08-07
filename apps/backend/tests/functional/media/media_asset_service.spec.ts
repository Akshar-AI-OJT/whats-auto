import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import MediaException from '#exceptions/media_exception'
import { MediaAssetState } from '#lib/media/types'
import { StorageObjectState } from '#lib/media/storage_types'
import { OUTBOUND_MEDIA_MAX_BYTES } from '#lib/meta_whatsapp/outbound_media'
import { MediaAssetRepository } from '#repositories/media_asset_repository'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import { OrganizationStorageObjectRepository } from '#repositories/organization_storage_object_repository'
import SignatureContentInspection from '#services/content_inspection/drivers/signature_content_inspection'
import {
  MediaAssetService,
  MEDIA_UPLOAD_PRESIGN_SECONDS,
  MEDIA_PENDING_UPLOAD_TTL_MS,
} from '#services/media_asset_service'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'
import { StorageQuotaService } from '#services/storage_quota_service'
import { runWithTenant } from '#services/tenant_context'
import env from '#start/env'

async function createOrg() {
  const id = randomUUID()
  const slug = `media-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `Media ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'US',
    timezone: 'UTC',
    currency: 'USD',
    status: true,
  })
  return id
}

/** JPEG/PNG buffers with valid magic bytes for content inspection. */
function mediaBytes(mimeType: 'image/jpeg' | 'image/png', size: number): Buffer {
  const buf = Buffer.alloc(Math.max(size, 4))
  if (mimeType === 'image/jpeg') {
    buf[0] = 0xff
    buf[1] = 0xd8
    buf[2] = 0xff
  } else {
    buf[0] = 0x89
    buf[1] = 0x50
    buf[2] = 0x4e
    buf[3] = 0x47
  }
  return buf.subarray(0, size)
}

function pdfBytes(size: number): Buffer {
  const prefix = Buffer.from('%PDF-1.4\n')
  if (size <= prefix.byteLength) return prefix.subarray(0, size)
  return Buffer.concat([prefix, Buffer.alloc(size - prefix.byteLength)])
}

function createService(storage: FakeObjectStorage) {
  return new MediaAssetService(
    new MediaAssetRepository(),
    new OrganizationStorageObjectRepository(),
    new StorageQuotaService(),
    new MediaAssetReferenceRepository(),
    storage,
    new SignatureContentInspection()
  )
}

test.group('MediaAssetService upload lifecycle', () => {
  test('initiates pending upload with v2 storage object, quota, and completes after put', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)
    const fileSize = 12

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize,
    })

    assert.equal(initiated.asset.state, MediaAssetState.PendingUpload)
    assert.equal(initiated.upload.method, 'PUT')
    assert.equal(initiated.upload.expiresInSeconds, MEDIA_UPLOAD_PRESIGN_SECONDS)
    assert.include(initiated.asset.deliveryUrl, env.get('MEDIA_PUBLIC_BASE_URL'))
    assert.lengthOf(storage.presigned, 1)
    assert.match(storage.presigned[0]!.key, /^organizations\/.+\/media-library\/images\//)

    const usage = await new StorageQuotaService().getUsage(organizationId)
    assert.equal(usage.reservedBytes, fileSize)
    assert.equal(usage.readyBytes, 0)

    const key = storage.presigned[0]!.key
    storage.putObject(key, mediaBytes('image/jpeg', fileSize), 'image/jpeg')

    const ready = await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })

    assert.equal(ready.state, MediaAssetState.Ready)
    assert.equal(ready.fileSize, fileSize)

    const usageReady = await new StorageQuotaService().getUsage(organizationId)
    assert.equal(usageReady.reservedBytes, 0)
    assert.equal(usageReady.readyBytes, fileSize)

    const storageRow = await runWithTenant(organizationId, async () => {
      const asset = await db.from('media_assets').where('id', initiated.asset.id).first()
      return db.from('organization_storage_objects').where('id', asset!.storageObjectId).first()
    })
    assert.equal(storageRow?.state, StorageObjectState.Ready)
    assert.equal(storageRow?.namespace, 'media_library')

    const again = await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    assert.equal(again.id, ready.id)
    assert.equal(again.state, MediaAssetState.Ready)
  })

  test('rejects unsupported mime and oversized files', async ({ assert }) => {
    const organizationId = await createOrg()
    const service = createService(new FakeObjectStorage())

    await assert.rejects(
      () =>
        service.initiateUpload({
          organizationId,
          uploadedBy: null,
          fileName: 'x.gif',
          mimeType: 'image/gif',
          fileSize: 100,
        }),
      MediaException
    )

    await assert.rejects(
      () =>
        service.initiateUpload({
          organizationId,
          uploadedBy: null,
          fileName: 'clip.mp4',
          mimeType: 'video/mp4',
          fileSize: 100,
        }),
      MediaException
    )

    try {
      await service.initiateUpload({
        organizationId,
        uploadedBy: null,
        fileName: 'big.jpg',
        mimeType: 'image/jpeg',
        fileSize: OUTBOUND_MEDIA_MAX_BYTES.image + 1,
      })
      assert.fail('expected size rejection')
    } catch (error) {
      assert.instanceOf(error, MediaException)
      assert.equal((error as MediaException).code, 'E_MEDIA_FILE_TOO_LARGE')
    }
  })

  test('initiates and completes PDF document uploads', async ({ assert }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)
    const fileSize = 24

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      fileSize,
    })

    assert.equal(initiated.asset.kind, 'document')
    assert.match(storage.presigned[0]!.key, /\/documents\//)

    storage.putObject(storage.presigned[0]!.key, pdfBytes(fileSize), 'application/pdf')
    const ready = await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    assert.equal(ready.state, MediaAssetState.Ready)
    assert.equal(ready.kind, 'document')
  })

  test('blocks soft delete while protected references exist', async ({ assert }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)
    const fileSize = 8

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'locked.jpg',
      mimeType: 'image/jpeg',
      fileSize,
    })
    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/jpeg', fileSize), 'image/jpeg')
    await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })

    await service.registerReference({
      organizationId,
      mediaAssetId: initiated.asset.id,
      ownerType: 'template',
      ownerId: randomUUID(),
    })

    try {
      await service.softDelete({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected protected reference block')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_HAS_REFERENCES')
    }
  })

  test('complete rejects missing object and cross-tenant ids', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)

    const initiated = await service.initiateUpload({
      organizationId: orgA,
      uploadedBy: null,
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      fileSize: 4,
    })

    try {
      await service.completeUpload({
        organizationId: orgA,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected incomplete')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_UPLOAD_INCOMPLETE')
    }

    try {
      await service.completeUpload({
        organizationId: orgB,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected not found')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_NOT_FOUND')
    }
  })

  test('complete rejects size/content-type mismatch, bad signature, and non-pending states', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      fileSize: 10,
    })

    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/jpeg', 3), 'image/jpeg')
    try {
      await service.completeUpload({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected size mismatch')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_UPLOAD_MISMATCH')
    }

    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/png', 10), 'image/png')
    try {
      await service.completeUpload({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected content-type mismatch')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_UPLOAD_MISMATCH')
    }

    storage.putObject(storage.presigned[0]!.key, Buffer.alloc(10), 'image/jpeg')
    try {
      await service.completeUpload({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected content rejected')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_CONTENT_REJECTED')
    }

    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/jpeg', 10), 'image/jpeg')
    const ready = await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    assert.equal(ready.state, MediaAssetState.Ready)

    await runWithTenant(organizationId, async () => {
      await db
        .from('media_assets')
        .where('id', initiated.asset.id)
        .update({ state: MediaAssetState.Failed })
    })

    try {
      await service.completeUpload({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected not pending')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_NOT_PENDING')
    }
  })

  test('expirePendingUploads marks stale pending rows failed, deletes objects, releases quota', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'stale.jpg',
      mimeType: 'image/jpeg',
      fileSize: 4,
    })
    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/jpeg', 4), 'image/jpeg')

    await runWithTenant(organizationId, async () => {
      await db
        .from('media_assets')
        .where('id', initiated.asset.id)
        .update({ createdAt: new Date(Date.now() - MEDIA_PENDING_UPLOAD_TTL_MS - 60_000) })
      const asset = await db.from('media_assets').where('id', initiated.asset.id).first()
      await db
        .from('organization_storage_objects')
        .where('id', asset!.storageObjectId)
        .update({ createdAt: new Date(Date.now() - MEDIA_PENDING_UPLOAD_TTL_MS - 60_000) })
    })

    const result = await service.expirePendingUploads({
      organizationId,
    })

    assert.equal(result.expired, 1)
    assert.include(storage.deletedKeys, storage.presigned[0]!.key)

    const row = await runWithTenant(organizationId, () =>
      db.from('media_assets').where('id', initiated.asset.id).first()
    )
    assert.equal(row?.state, MediaAssetState.Failed)

    const usage = await new StorageQuotaService().getUsage(organizationId)
    assert.equal(usage.reservedBytes, 0)
    assert.equal(usage.readyBytes, 0)
  })

  test('softDelete, restore, and purge manage storage object and quota', async ({ assert }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const service = createService(storage)
    const fileSize = 8

    const initiated = await service.initiateUpload({
      organizationId,
      uploadedBy: null,
      fileName: 'keep.jpg',
      mimeType: 'image/jpeg',
      fileSize,
    })
    storage.putObject(storage.presigned[0]!.key, mediaBytes('image/jpeg', fileSize), 'image/jpeg')
    await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })

    const deleted = await service.softDelete({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    assert.equal(deleted.state, MediaAssetState.Deleted)

    let usage = await new StorageQuotaService().getUsage(organizationId)
    assert.equal(usage.readyBytes, fileSize)

    const restored = await service.restore({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    assert.equal(restored.state, MediaAssetState.Ready)

    await service.softDelete({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })
    await service.purge({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })

    assert.include(storage.deletedKeys, storage.presigned[0]!.key)
    usage = await new StorageQuotaService().getUsage(organizationId)
    assert.equal(usage.readyBytes, 0)

    const storageRow = await runWithTenant(organizationId, async () => {
      const asset = await db.from('media_assets').where('id', initiated.asset.id).first()
      return db.from('organization_storage_objects').where('id', asset!.storageObjectId).first()
    })
    assert.equal(storageRow?.state, StorageObjectState.Purged)
  })
})
