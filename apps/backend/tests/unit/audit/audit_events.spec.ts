import { test } from '@japa/runner'
import {
  PLATFORM_AUDIT_EVENT_TYPES,
  TENANT_AUDIT_EVENT_TYPES,
  eventTypesForScope,
} from '#abilities/audit_events'

test.group('audit event catalogs', () => {
  test('platform scope excludes tenant RBAC events', ({ assert }) => {
    const types = eventTypesForScope('platform')
    assert.isFalse(types.includes('role.created'))
    assert.isFalse(types.includes('invitation.created'))
    assert.isTrue(types.includes('organization.created'))
    assert.deepEqual([...types], [...PLATFORM_AUDIT_EVENT_TYPES])
  })

  test('tenant scope excludes org lifecycle events', ({ assert }) => {
    const types = eventTypesForScope('tenant')
    assert.isFalse(types.includes('organization.created'))
    assert.isFalse(types.includes('ownership.transferred'))
    assert.isTrue(types.includes('role.created'))
    assert.isTrue(types.includes('role.permission_override'))
    assert.deepEqual([...types], [...TENANT_AUDIT_EVENT_TYPES])
  })
})
