import { test } from '@japa/runner'
import {
  isApprovedOutboundMediaUrl,
  isMimeTypeAllowedForMediaType,
  isOutboundMediaSizeAllowed,
  isTenantOutboundMediaType,
  OUTBOUND_MEDIA_MAX_BYTES,
  outboundMediaTypeForMime,
  parseOutboundMediaAllowedHosts,
  SYSTEM_OUTBOUND_MEDIA_TYPES,
  TENANT_OUTBOUND_MEDIA_TYPES,
  tenantOutboundMediaTypeForMime,
} from '#lib/meta_whatsapp/outbound_media'

test.group('Outbound media validation helpers', () => {
  test('parses host allowlist and validates approved public URLs', ({ assert }) => {
    assert.deepEqual(parseOutboundMediaAllowedHosts('cdn.example.com, Media.CDN.com '), [
      'cdn.example.com',
      'media.cdn.com',
    ])

    assert.isTrue(isApprovedOutboundMediaUrl('https://cdn.example.com/a.jpg', []))
    assert.isFalse(isApprovedOutboundMediaUrl('s3://bucket/a.jpg', []))
    assert.isTrue(isApprovedOutboundMediaUrl('https://cdn.example.com/a.jpg', ['cdn.example.com']))
    assert.isTrue(
      isApprovedOutboundMediaUrl('https://assets.cdn.example.com/a.jpg', ['cdn.example.com'])
    )
    assert.isFalse(isApprovedOutboundMediaUrl('https://evil.com/a.jpg', ['cdn.example.com']))
  })

  test('enforces WhatsApp MIME allowlist and size caps', ({ assert }) => {
    assert.isTrue(isMimeTypeAllowedForMediaType('image', 'image/jpeg'))
    assert.isFalse(isMimeTypeAllowedForMediaType('image', 'image/gif'))
    assert.isTrue(isMimeTypeAllowedForMediaType('document', 'application/pdf'))
    assert.isFalse(isMimeTypeAllowedForMediaType('document', 'application/zip'))
    assert.equal(outboundMediaTypeForMime('image/png'), 'image')
    assert.equal(outboundMediaTypeForMime('application/pdf'), 'document')
    assert.isNull(outboundMediaTypeForMime('image/gif'))
    assert.isNull(outboundMediaTypeForMime('video/mp4'))

    assert.isTrue(isOutboundMediaSizeAllowed('image', OUTBOUND_MEDIA_MAX_BYTES.image))
    assert.isFalse(isOutboundMediaSizeAllowed('image', OUTBOUND_MEDIA_MAX_BYTES.image + 1))
    assert.isTrue(isOutboundMediaSizeAllowed('document', 50 * 1024 * 1024))
  })

  test('tenant channel is image-only; system allows image and document', ({ assert }) => {
    assert.deepEqual([...TENANT_OUTBOUND_MEDIA_TYPES], ['image'])
    assert.deepEqual([...SYSTEM_OUTBOUND_MEDIA_TYPES], ['image', 'document'])
    assert.isTrue(isTenantOutboundMediaType('image'))
    assert.isFalse(isTenantOutboundMediaType('document'))
    assert.equal(tenantOutboundMediaTypeForMime('image/jpeg'), 'image')
    assert.isNull(tenantOutboundMediaTypeForMime('application/pdf'))
    assert.isNull(tenantOutboundMediaTypeForMime('video/mp4'))
  })
})
