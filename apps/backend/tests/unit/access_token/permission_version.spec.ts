import { test } from '@japa/runner'
import {
  checkPlatformPermissionVersion,
  checkTenantPermissionVersion,
} from '#lib/permission_version'

test.group('permission_version checks', () => {
  test('tenant match succeeds', ({ assert }) => {
    const result = checkTenantPermissionVersion({
      claims: {
        sub: 'user-1',
        org_id: 'org-1',
        member_id: 'member-1',
        pv: 3,
      },
      member: {
        id: 'member-1',
        userId: 'user-1',
        organizationId: 'org-1',
        permissionVersion: 3,
      },
    })
    assert.deepEqual(result, { ok: true })
  })

  test('tenant missing grant fails', ({ assert }) => {
    const result = checkTenantPermissionVersion({
      claims: {
        sub: 'user-1',
        org_id: 'org-1',
        member_id: 'member-1',
        pv: 1,
      },
      member: null,
    })
    assert.deepEqual(result, { ok: false, reason: 'MISSING_GRANT' })
  })

  test('tenant stale version fails', ({ assert }) => {
    const result = checkTenantPermissionVersion({
      claims: {
        sub: 'user-1',
        org_id: 'org-1',
        member_id: 'member-1',
        pv: 1,
      },
      member: {
        id: 'member-1',
        userId: 'user-1',
        organizationId: 'org-1',
        permissionVersion: 2,
      },
    })
    assert.deepEqual(result, { ok: false, reason: 'STALE_VERSION' })
  })

  test('tenant subject mismatch fails', ({ assert }) => {
    const result = checkTenantPermissionVersion({
      claims: {
        sub: 'user-1',
        org_id: 'org-1',
        member_id: 'member-1',
        pv: 1,
      },
      member: {
        id: 'member-1',
        userId: 'user-2',
        organizationId: 'org-1',
        permissionVersion: 1,
      },
    })
    assert.deepEqual(result, { ok: false, reason: 'SUBJECT_MISMATCH' })
  })

  test('platform match succeeds', ({ assert }) => {
    const result = checkPlatformPermissionVersion({
      claims: { sub: 'user-1', pv: 4 },
      grant: { userId: 'user-1', permissionVersion: 4 },
    })
    assert.deepEqual(result, { ok: true })
  })

  test('platform missing pv fails', ({ assert }) => {
    const result = checkPlatformPermissionVersion({
      claims: { sub: 'user-1' },
      grant: { userId: 'user-1', permissionVersion: 1 },
    })
    assert.deepEqual(result, { ok: false, reason: 'MISSING_PV' })
  })

  test('role A to B to A does not revalidate old A token', ({ assert }) => {
    // Counter went 1 → 2 → 3; an old token minted at pv=1 stays stale forever.
    const result = checkTenantPermissionVersion({
      claims: {
        sub: 'user-1',
        org_id: 'org-1',
        member_id: 'member-1',
        pv: 1,
      },
      member: {
        id: 'member-1',
        userId: 'user-1',
        organizationId: 'org-1',
        permissionVersion: 3,
      },
    })
    assert.deepEqual(result, { ok: false, reason: 'STALE_VERSION' })
  })
})
