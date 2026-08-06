import { test } from '@japa/runner'
import { buildMediaDeliveryUrl } from '#lib/media/delivery_url'
import { buildMediaStorageKey, extensionForMedia } from '#lib/media/storage_key'
import { MediaAssetSource } from '#lib/media/types'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'

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
  test('presigns, heads, and deletes objects', async ({ assert }) => {
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

    storage.putObject(key, Buffer.from('jpeg'), 'image/jpeg')
    const head = await storage.headObject(key)
    assert.equal(head?.contentLength, 4)
    assert.equal(head?.contentType, 'image/jpeg')

    await storage.deleteObject(key)
    assert.isNull(await storage.headObject(key))
    assert.deepEqual(storage.deletedKeys, [key])
  })
})
