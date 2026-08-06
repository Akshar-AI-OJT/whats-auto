import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import MediaException from '#exceptions/media_exception'
import { MediaAssetState } from '#lib/media/types'
import { OUTBOUND_MEDIA_MAX_BYTES } from '#lib/meta_whatsapp/outbound_media'
import { MediaAssetRepository } from '#repositories/media_asset_repository'
import { MediaAssetService, MEDIA_UPLOAD_PRESIGN_SECONDS } from '#services/media_asset_service'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'
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

function createService(storage: FakeObjectStorage) {
  return new MediaAssetService(new MediaAssetRepository(), storage)
}

test.group('MediaAssetService upload lifecycle', () => {
  test('initiates pending upload with storage key under CDN base and completes after put', async ({
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

    const key = storage.presigned[0]!.key
    storage.putObject(key, Buffer.alloc(fileSize), 'image/jpeg')

    const ready = await service.completeUpload({
      organizationId,
      mediaAssetId: initiated.asset.id,
    })

    assert.equal(ready.state, MediaAssetState.Ready)
    assert.equal(ready.fileSize, fileSize)

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
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
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

  test('complete rejects size/content-type mismatch and non-pending states', async ({ assert }) => {
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

    storage.putObject(storage.presigned[0]!.key, Buffer.alloc(3), 'image/jpeg')
    try {
      await service.completeUpload({
        organizationId,
        mediaAssetId: initiated.asset.id,
      })
      assert.fail('expected size mismatch')
    } catch (error) {
      assert.equal((error as MediaException).code, 'E_MEDIA_UPLOAD_MISMATCH')
    }

    storage.putObject(storage.presigned[0]!.key, Buffer.alloc(10), 'image/png')
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

  test('expirePendingUploads marks stale pending rows failed and deletes objects', async ({
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
    storage.putObject(storage.presigned[0]!.key, Buffer.alloc(4), 'image/jpeg')

    await runWithTenant(organizationId, async () => {
      await db
        .from('media_assets')
        .where('id', initiated.asset.id)
        .update({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
    })

    const result = await service.expirePendingUploads({
      organizationId,
      olderThanMs: 15 * 60 * 1000,
    })

    assert.equal(result.expired, 1)
    assert.include(storage.deletedKeys, storage.presigned[0]!.key)

    const row = await runWithTenant(organizationId, () =>
      db.from('media_assets').where('id', initiated.asset.id).first()
    )
    assert.equal(row?.state, MediaAssetState.Failed)
  })
})
