import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from '@japa/runner'
import LocalObjectStorage from '#services/object_storage/drivers/local_object_storage'
import {
  buildLocalMediaUploadUrl,
  verifyMediaUploadSignature,
} from '#lib/media/media_upload_signature'

test.group('LocalObjectStorage', (group) => {
  let root = ''

  group.each.setup(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'wa-media-'))
  })

  group.each.teardown(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function storage() {
    return new LocalObjectStorage({
      root,
      appUrl: 'https://api.example.com',
      signingSecret: 'test-signing-secret-at-least-32-chars',
    })
  }

  test('write head prefix delete round-trip', async ({ assert }) => {
    const s = storage()
    const key = 'org/abc/media_library/images/file.jpg'
    const body = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02])

    await s.writeObject({ key, body, contentType: 'image/jpeg' })

    const head = await s.headObject(key)
    assert.isNotNull(head)
    assert.equal(head!.contentLength, body.byteLength)

    const prefix = await s.getObjectPrefix({ key, maxBytes: 3 })
    assert.deepEqual(Array.from(prefix!), [0xff, 0xd8, 0xff])

    const onDisk = await readFile(path.join(root, key))
    assert.deepEqual(Array.from(onDisk), Array.from(body))

    await s.deleteObject(key)
    assert.isNull(await s.headObject(key))
  })

  test('rejects path traversal keys', async ({ assert }) => {
    const s = storage()
    await assert.rejects(() =>
      s.writeObject({
        key: '../outside.txt',
        body: new Uint8Array([1]),
        contentType: 'text/plain',
      })
    )
    await assert.rejects(() =>
      s.writeObject({
        key: 'ok/../../etc/passwd',
        body: new Uint8Array([1]),
        contentType: 'text/plain',
      })
    )
  })

  test('createPresignedUpload builds HMAC URL with asset and org', async ({ assert }) => {
    const s = storage()
    const upload = await s.createPresignedUpload({
      key: 'org/1/media_library/images/a.jpg',
      contentType: 'image/jpeg',
      contentLength: 10,
      expiresInSeconds: 60,
      assetId: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
    })

    assert.equal(upload.method, 'PUT')
    assert.include(upload.url, '/api/v1/media/uploads/11111111-1111-1111-1111-111111111111/content')
    assert.include(upload.url, 'sig=')
    assert.equal(upload.headers['Content-Type'], 'image/jpeg')
  })

  test('createPresignedUpload requires assetId and organizationId', async ({ assert }) => {
    const s = storage()
    await assert.rejects(() =>
      s.createPresignedUpload({
        key: 'k',
        contentType: 'image/jpeg',
        contentLength: 1,
      })
    )
  })
})

test.group('media_upload_signature', () => {
  test('sign and verify round-trip', ({ assert }) => {
    const secret = 'test-signing-secret-at-least-32-chars'
    const { url, expiresAtUnix } = buildLocalMediaUploadUrl({
      appUrl: 'https://api.example.com',
      assetId: 'asset-1',
      storageKey: 'org/x/a.jpg',
      organizationId: 'org-1',
      secret,
      expiresInSeconds: 120,
    })
    const parsed = new URL(url)
    assert.isTrue(
      verifyMediaUploadSignature({
        secret,
        signature: parsed.searchParams.get('sig')!,
        payload: {
          assetId: 'asset-1',
          storageKey: 'org/x/a.jpg',
          organizationId: 'org-1',
          expiresAtUnix,
        },
      })
    )
  })

  test('rejects tampered signature', ({ assert }) => {
    const secret = 'test-signing-secret-at-least-32-chars'
    const { expiresAtUnix } = buildLocalMediaUploadUrl({
      appUrl: 'https://api.example.com',
      assetId: 'asset-1',
      storageKey: 'org/x/a.jpg',
      organizationId: 'org-1',
      secret,
      expiresInSeconds: 120,
    })
    assert.isFalse(
      verifyMediaUploadSignature({
        secret,
        signature: 'deadbeef',
        payload: {
          assetId: 'asset-1',
          storageKey: 'org/x/a.jpg',
          organizationId: 'org-1',
          expiresAtUnix,
        },
      })
    )
  })
})
