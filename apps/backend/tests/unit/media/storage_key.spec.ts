import { test } from '@japa/runner'
import { buildMediaDeliveryUrl } from '#lib/media/delivery_url'
import {
  buildOrganizationStorageKey,
  isLegacyStorageKey,
  retentionForNamespace,
} from '#lib/media/organization_storage_key'
import { buildMediaStorageKey, extensionForMedia } from '#lib/media/storage_key'
import { StorageNamespace, StorageRetentionPolicy } from '#lib/media/storage_types'
import { MediaAssetSource } from '#lib/media/types'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'
import SignatureContentInspection from '#services/content_inspection/drivers/signature_content_inspection'

test.group('Media storage key + delivery URL', () => {
  test('builds hierarchical org keys without user filenames in the path', ({ assert }) => {
    const key = buildMediaStorageKey({
      organizationId: '7bd23286-0000-4000-8000-000000000001',
      source: MediaAssetSource.Upload,
      mediaType: 'image',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      mimeType: 'image/jpeg',
      fileName: '../../evil banner (1).JPG',
      at: new Date(Date.UTC(2026, 7, 6)),
    })

    assert.equal(
      key,
      '7bd23286-0000-4000-8000-000000000001/upload/images/2026/08/550e8400-e29b-41d4-a716-446655440000.jpg'
    )
    assert.isTrue(isLegacyStorageKey(key))
  })

  test('builds v2 organization namespace keys for knowledge base', ({ assert }) => {
    const key = buildOrganizationStorageKey({
      organizationId: '7bd23286-0000-4000-8000-000000000001',
      namespace: StorageNamespace.KnowledgeBase,
      mediaType: 'document',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      mimeType: 'application/pdf',
      fileName: 'pricing.pdf',
    })

    assert.equal(
      key,
      'organizations/7bd23286-0000-4000-8000-000000000001/knowledge-base/documents/550e8400-e29b-41d4-a716-446655440000.pdf'
    )
    assert.equal(
      retentionForNamespace(StorageNamespace.KnowledgeBase),
      StorageRetentionPolicy.UntilDeleted
    )
  })

  test('builds v2 organization namespace keys for media library', ({ assert }) => {
    const key = buildOrganizationStorageKey({
      organizationId: '7bd23286-0000-4000-8000-000000000001',
      namespace: StorageNamespace.MediaLibrary,
      mediaType: 'image',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      mimeType: 'image/jpeg',
      fileName: '../../evil banner (1).JPG',
    })

    assert.equal(
      key,
      'organizations/7bd23286-0000-4000-8000-000000000001/media-library/images/550e8400-e29b-41d4-a716-446655440000.jpg'
    )
    assert.isFalse(isLegacyStorageKey(key))
    assert.equal(
      retentionForNamespace(StorageNamespace.MediaLibrary),
      StorageRetentionPolicy.UntilDeleted
    )
  })

  test('builds v2 organization profile logo key', ({ assert }) => {
    const key = buildOrganizationStorageKey({
      organizationId: '7bd23286-0000-4000-8000-000000000001',
      namespace: StorageNamespace.Profile,
      mediaType: 'image',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      mimeType: 'image/png',
      fileName: 'brand logo.PNG',
    })

    assert.equal(key, 'organizations/7bd23286-0000-4000-8000-000000000001/profile/logo.png')
    assert.equal(
      retentionForNamespace(StorageNamespace.Profile),
      StorageRetentionPolicy.UntilDeleted
    )
  })

  test('maps document mime types and inbound source segment', ({ assert }) => {
    assert.equal(extensionForMedia({ mimeType: 'application/pdf' }), '.pdf')

    const key = buildMediaStorageKey({
      organizationId: 'org-1',
      source: MediaAssetSource.Inbound,
      mediaType: 'document',
      assetId: 'asset-1',
      mimeType: 'application/pdf',
      at: new Date(Date.UTC(2026, 0, 15)),
    })

    assert.equal(key, 'org-1/inbound/documents/2026/01/asset-1.pdf')
  })

  test('joins CDN base URL and storage key without double slashes', ({ assert }) => {
    assert.equal(
      buildMediaDeliveryUrl('https://d25ndj2ptpjzkb.cloudfront.net/', 'org/upload/images/a.jpg'),
      'https://d25ndj2ptpjzkb.cloudfront.net/org/upload/images/a.jpg'
    )
  })
})

test.group('FakeObjectStorage', () => {
  test('presigns, heads, prefixes, and deletes objects', async ({ assert }) => {
    const storage = new FakeObjectStorage()
    const key = 'org/upload/images/2026/08/a.jpg'

    const upload = await storage.createPresignedUpload({
      key,
      contentType: 'image/jpeg',
      contentLength: 4,
    })
    assert.equal(upload.method, 'PUT')
    assert.include(upload.url, encodeURIComponent(key))

    assert.isNull(await storage.headObject(key))

    storage.putObject(key, Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')
    const head = await storage.headObject(key)
    assert.equal(head?.contentLength, 4)
    assert.equal(head?.contentType, 'image/jpeg')

    const prefix = await storage.getObjectPrefix({ key, maxBytes: 2 })
    assert.deepEqual(Array.from(prefix ?? []), [0xff, 0xd8])

    const full = await storage.getObject(key)
    assert.deepEqual(Array.from(full ?? []), [0xff, 0xd8, 0xff, 0x00])
    assert.isTrue(await storage.objectExists(key))

    await storage.deleteObject(key)
    assert.isNull(await storage.headObject(key))
    assert.isNull(await storage.getObject(key))
    assert.isFalse(await storage.objectExists(key))
    assert.deepEqual(storage.deletedKeys, [key])
  })
})

test.group('SignatureContentInspection', () => {
  test('accepts JPEG/PNG/PDF signatures and rejects mismatches', async ({ assert }) => {
    const inspection = new SignatureContentInspection()

    const jpegOk = await inspection.inspect({
      mimeType: 'image/jpeg',
      prefix: new Uint8Array([0xff, 0xd8, 0xff]),
      sizeBytes: 3,
    })
    assert.isTrue(jpegOk.ok)

    const jpegMismatch = await inspection.inspect({
      mimeType: 'image/jpeg',
      prefix: new Uint8Array([0x00, 0x00]),
      sizeBytes: 2,
    })
    assert.isFalse(jpegMismatch.ok)

    const pdfOk = await inspection.inspect({
      mimeType: 'application/pdf',
      prefix: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      sizeBytes: 4,
    })
    assert.isTrue(pdfOk.ok)
  })
})
