import path from 'node:path'
import { test } from '@japa/runner'
import { resolveMediaLocalRoot } from '#services/object_storage/resolve_media_local_root'

test.group('resolveMediaLocalRoot', () => {
  const appRoot = path.resolve('/app/apps/backend')

  test('defaults to app-root/media when unset', ({ assert }) => {
    assert.equal(resolveMediaLocalRoot(undefined, appRoot), path.resolve(appRoot, 'media'))
    assert.equal(resolveMediaLocalRoot('', appRoot), path.resolve(appRoot, 'media'))
    assert.equal(resolveMediaLocalRoot('   ', appRoot), path.resolve(appRoot, 'media'))
  })

  test('keeps absolute paths', ({ assert }) => {
    const absolute = path.resolve('/var/www/whats-auto/media')
    assert.equal(resolveMediaLocalRoot(absolute, appRoot), path.normalize(absolute))
  })

  test('anchors relative paths to the app root, not process.cwd()', ({ assert }) => {
    assert.equal(resolveMediaLocalRoot('./media', appRoot), path.resolve(appRoot, './media'))
    assert.equal(resolveMediaLocalRoot('media', appRoot), path.resolve(appRoot, 'media'))
    assert.notEqual(resolveMediaLocalRoot('./media', appRoot), path.resolve(process.cwd(), './media'))
  })
})
