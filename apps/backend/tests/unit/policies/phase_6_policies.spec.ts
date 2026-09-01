import { test } from '@japa/runner'
import SuperAdminPolicy from '#policies/super_admin_policy'
import AuditPolicy from '#policies/audit_policy'
import type { AuthzPrincipal } from '#types/http'
import type { Permission } from '#abilities/permissions'

function makePrincipal(overrides: {
  id?: string
  email?: string
  role?: string
  memberId?: string
  orgId?: string
  permissions?: Permission[]
}): AuthzPrincipal {
  return {
    id: overrides.id ?? 'user-1',
    name: 'Test User',
    firstname: 'Test',
    lastname: 'User',
    email: overrides.email ?? 'test@example.com',
    emailVerified: true,
    image: null,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    activeMember: overrides.role
      ? {
          id: overrides.memberId ?? 'member-1',
          organizationId: overrides.orgId ?? 'org-1',
          userId: overrides.id ?? 'user-1',
          role: overrides.role,
          roleId: 'role-1',
        }
      : undefined,
    memberPermissions: new Set(overrides.permissions ?? []),
  }
}

test.group('Phase 6 Policies - SuperAdminPolicy', () => {
  const policy = new SuperAdminPolicy()

  test('checks platform permissions', ({ assert }) => {
    const admin = makePrincipal({
      role: 'superadmin',
      permissions: [
        'platform:tenants_view',
        'platform:tenants_update',
        'platform:tenants_delete',
        'platform:tenants_billing',
        'platform:config_view',
        'platform:config_manage',
        'platform:audit_view',
      ],
    })
    const unprivileged = makePrincipal({ role: 'agent', permissions: [] })

    assert.isTrue(policy.viewTenants(admin))
    assert.isFalse(policy.viewTenants(unprivileged))

    assert.isTrue(policy.updateTenants(admin))
    assert.isFalse(policy.updateTenants(unprivileged))

    assert.isTrue(policy.deleteTenants(admin))
    assert.isFalse(policy.deleteTenants(unprivileged))

    assert.isTrue(policy.manageBilling(admin))
    assert.isFalse(policy.manageBilling(unprivileged))

    assert.isTrue(policy.viewAiConfig(admin))
    assert.isFalse(policy.viewAiConfig(unprivileged))

    assert.isTrue(policy.manageAiConfig(admin))
    assert.isFalse(policy.manageAiConfig(unprivileged))

    assert.isTrue(policy.viewAuditLogs(admin))
    assert.isFalse(policy.viewAuditLogs(unprivileged))
  })
})

test.group('Phase 6 Policies - AuditPolicy', () => {
  const policy = new AuditPolicy()

  test('platform auditor cannot use the tenant audit policy', ({ assert }) => {
    const auditor = makePrincipal({
      role: 'superadmin',
      permissions: ['platform:audit_view'],
    })

    assert.isFalse(policy.view(auditor, null))
    assert.isFalse(policy.view(auditor, 'org-any'))
  })

  test('tenant member can view own org audit log with audit:view', ({ assert }) => {
    const member = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['audit:view'],
    })
    const teamOnly = makePrincipal({
      role: 'agent',
      orgId: 'org-1',
      permissions: ['team:view'],
    })
    const unprivileged = makePrincipal({
      role: 'agent',
      orgId: 'org-1',
      permissions: [],
    })

    assert.isTrue(policy.view(member, 'org-1'))
    assert.isFalse(policy.view(member, 'org-2'))
    assert.isFalse(policy.view(teamOnly, 'org-1'))
    assert.isFalse(policy.view(unprivileged, 'org-1'))
  })
})
