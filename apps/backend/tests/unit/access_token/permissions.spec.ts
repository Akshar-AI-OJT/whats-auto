import { test } from '@japa/runner'
import {
  computePermissionVersion,
  formatScope,
  parseScope,
  permissionsFromClaims,
} from '#lib/access_token_permissions'
import { PRODUCT_PERMISSIONS } from '#abilities/permissions'

test.group('access_token_permissions', () => {
  test('parseScope rejects unknown permissions', ({ assert }) => {
    assert.throws(() => parseScope('contacts:view not:a_real_perm'), /Unknown permission/)
  })

  test('parseScope accepts catalog permissions', ({ assert }) => {
    const set = parseScope('contacts:view contacts:create')
    assert.isTrue(set.has('contacts:view'))
    assert.isTrue(set.has('contacts:create'))
    assert.equal(set.size, 2)
  })

  test('permissionsFromClaims expands owner catalog', ({ assert }) => {
    const set = permissionsFromClaims({ role: 'owner', scope: '' })
    assert.equal(set.size, PRODUCT_PERMISSIONS.length)
    assert.isTrue(set.has('org:delete'))
    assert.isFalse(set.has('platform:tenants_view'))
  })

  test('formatScope is sorted and stable', ({ assert }) => {
    assert.equal(formatScope(['team:view', 'contacts:view']), 'contacts:view team:view')
  })

  test('computePermissionVersion is deterministic', ({ assert }) => {
    const a = computePermissionVersion('admin', 'contacts:view team:view')
    const b = computePermissionVersion('admin', 'contacts:view team:view')
    assert.equal(a, b)
    assert.equal(a.length, 16)
  })
})
