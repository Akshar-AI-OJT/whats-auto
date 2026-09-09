import { test } from '@japa/runner'
import OrganizationAdminUserPolicy from '#policies/organization_admin_user_policy'
import OwnershipPolicy from '#policies/ownership_policy'
import OrganizationPolicy from '#policies/organization_policy'
import InvitationPolicy from '#policies/invitation_policy'
import { accessOrgAdmin, accessPlatform } from '#abilities/main'
import type { AuthzPrincipal } from '#types/http'
import type { Permission } from '#abilities/permissions'
import { AuthorizationResponse } from '@adonisjs/bouncer'

function makePrincipal(overrides: {
  id?: string
  email?: string
  role?: string
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
          id: 'member-1',
          organizationId: overrides.orgId ?? 'org-1',
          userId: overrides.id ?? 'user-1',
          role: overrides.role,
          roleId: 'role-1',
        }
      : undefined,
    memberPermissions: new Set(overrides.permissions ?? []),
  }
}

test.group('Phase 1 Policies - OrganizationAdminUserPolicy', () => {
  const policy = new OrganizationAdminUserPolicy()

  test('allows admin and owner', ({ assert }) => {
    const admin = makePrincipal({ role: 'admin', orgId: 'org-1' })
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })

    assert.isTrue(policy.viewAny(admin))
    assert.isTrue(policy.view(admin))
    assert.isTrue(policy.update(admin))
    assert.isTrue(policy.delete(admin))

    assert.isTrue(policy.viewAny(owner))
    assert.isTrue(policy.view(owner))
    assert.isTrue(policy.update(owner))
    assert.isTrue(policy.delete(owner))
  })

  test('denies agent and viewer', ({ assert }) => {
    const agent = makePrincipal({ role: 'agent', orgId: 'org-1' })
    const viewer = makePrincipal({ role: 'viewer', orgId: 'org-1' })

    assert.instanceOf(policy.viewAny(agent), AuthorizationResponse)
    assert.instanceOf(policy.view(viewer), AuthorizationResponse)
    assert.instanceOf(policy.update(agent), AuthorizationResponse)
    assert.instanceOf(policy.delete(viewer), AuthorizationResponse)
  })
})

test.group('Phase 1 Policies - OwnershipPolicy', () => {
  const policy = new OwnershipPolicy()

  test('transfer allows owner', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.transfer(owner))
  })

  test('transfer denies non-owner', ({ assert }) => {
    const admin = makePrincipal({ role: 'admin', orgId: 'org-1' })
    const agent = makePrincipal({ role: 'agent', orgId: 'org-1' })

    assert.instanceOf(policy.transfer(admin), AuthorizationResponse)
    assert.instanceOf(policy.transfer(agent), AuthorizationResponse)
  })
})

test.group('Phase 1 Policies - OrganizationPolicy', () => {
  const policy = new OrganizationPolicy()

  test('owner can update the active organization without explicit permission', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.update(owner, 'org-1'))
  })

  test('owner cannot update a different organization without set-active', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.instanceOf(policy.update(owner, 'org-2'), AuthorizationResponse)
  })

  test('owner cannot update an arbitrary organization id', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.instanceOf(
      policy.update(owner, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      AuthorizationResponse
    )
  })

  test('update allows when orgId matches and user has org:settings_manage', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['org:settings_manage'],
    })
    assert.isTrue(policy.update(admin, 'org-1'))
  })

  test('update denies when orgId mismatches', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['org:settings_manage'],
    })
    assert.instanceOf(policy.update(admin, 'org-2'), AuthorizationResponse)
  })

  test('delete denies non-owner even with org:delete permission', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['org:delete'],
    })
    assert.instanceOf(policy.delete(admin, 'org-1'), AuthorizationResponse)
  })
})

test.group('Phase 1 Policies - InvitationPolicy', () => {
  const policy = new InvitationPolicy()

  test('store allows matching orgId with team:invite permission', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['team:invite'],
    })
    assert.isTrue(policy.store(admin, 'org-1'))
  })

  test('store denies mismatched orgId', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['team:invite'],
    })
    assert.instanceOf(policy.store(admin, 'org-2'), AuthorizationResponse)
  })

  test('resend allows team:invite permission', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['team:invite'],
    })
    assert.isTrue(policy.resend(admin))
  })
})

test.group('Phase 1 Abilities - main.ts', () => {
  test('accessOrgAdmin evaluates roles correctly', ({ assert }) => {
    const admin = makePrincipal({ role: 'admin' })
    const owner = makePrincipal({ role: 'owner' })
    const agent = makePrincipal({ role: 'agent' })

    assert.isTrue(accessOrgAdmin.execute(admin))
    assert.isTrue(accessOrgAdmin.execute(owner))
    assert.isFalse(accessOrgAdmin.execute(agent))
  })

  test('accessPlatform evaluates platform permissions only', ({ assert }) => {
    const superadminRoleOnly = makePrincipal({ role: 'superadmin' })
    const superadminPerm = makePrincipal({ permissions: ['platform:tenants_view'] })
    const owner = makePrincipal({ role: 'owner' })

    // Role alone is insufficient — platform middleware hydrates platform:* into memberPermissions.
    assert.isFalse(accessPlatform.execute(superadminRoleOnly))
    assert.isTrue(accessPlatform.execute(superadminPerm))
    assert.isFalse(accessPlatform.execute(owner))
  })
})
