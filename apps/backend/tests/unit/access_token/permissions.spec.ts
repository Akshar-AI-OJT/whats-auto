import { test } from '@japa/runner'
import { formatScope, parseScope, permissionsFromClaims } from '#lib/access_token_permissions'
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

  test('permissionsFromClaims uses minted scope for owner (no role-name expand)', ({ assert }) => {
    const empty = permissionsFromClaims({ role: 'owner', scope: '' })
    assert.equal(empty.size, 0)

    const scope = formatScope(PRODUCT_PERMISSIONS)
    const set = permissionsFromClaims({ role: 'owner', scope })
    assert.equal(set.size, PRODUCT_PERMISSIONS.length)
    assert.isTrue(set.has('org:delete'))
    assert.isFalse(set.has('platform:tenants_view'))
  })

  test('permissionsFromClaims uses minted scope for superadmin', ({ assert }) => {
    const set = permissionsFromClaims({
      role: 'superadmin',
      scope: 'platform:tenants_view platform:audit_view',
    })
    assert.equal(set.size, 2)
    assert.isTrue(set.has('platform:tenants_view'))
  })

  test('formatScope is sorted and stable', ({ assert }) => {
    assert.equal(formatScope(['team:view', 'contacts:view']), 'contacts:view team:view')
  })
})
