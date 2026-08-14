import { test } from '@japa/runner'
import MemberPolicy from '#policies/member_policy'
import RolePolicy from '#policies/role_policy'
import ContactPolicy from '#policies/contact_policy'
import TagPolicy from '#policies/tag_policy'
import type { AuthzPrincipal } from '#types/http'
import type { Permission } from '#abilities/permissions'
import { AuthorizationResponse } from '@adonisjs/bouncer'

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

test.group('Phase 3 Policies - MemberPolicy', () => {
  const policy = new MemberPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('viewList checks team:view', ({ assert }) => {
    const allowed = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['team:view'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewList(allowed))
    assert.isFalse(policy.viewList(denied))
  })

  test('assignRole guards self-assignment, owner target, and tenant isolation', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      memberId: 'mem-admin',
      orgId: 'org-1',
      permissions: ['team:role_assign'],
    })

    // Allowed target
    assert.isTrue(
      policy.assignRole(admin, {
        id: 'mem-agent',
        organizationId: 'org-1',
        role: 'agent',
      })
    )

    // Self assignment denied
    const selfRes = policy.assignRole(admin, {
      id: 'mem-admin',
      organizationId: 'org-1',
      role: 'agent',
    })
    assert.instanceOf(selfRes, AuthorizationResponse)
    assert.equal((selfRes as AuthorizationResponse).status, 422)

    // Owner target denied
    const ownerRes = policy.assignRole(admin, {
      id: 'mem-owner',
      organizationId: 'org-1',
      role: 'owner',
    })
    assert.instanceOf(ownerRes, AuthorizationResponse)
    assert.equal((ownerRes as AuthorizationResponse).status, 422)

    // Cross-tenant target denied
    const crossRes = policy.assignRole(admin, {
      id: 'mem-agent',
      organizationId: 'org-2',
      role: 'agent',
    })
    assert.instanceOf(crossRes, AuthorizationResponse)
    assert.equal((crossRes as AuthorizationResponse).status, 404)
  })

  test('remove guards owner target and tenant isolation', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['team:remove'],
    })

    // Allowed target
    assert.isTrue(
      policy.remove(admin, {
        id: 'mem-agent',
        organizationId: 'org-1',
        role: 'agent',
      })
    )

    // Owner target denied
    const ownerRes = policy.remove(admin, {
      id: 'mem-owner',
      organizationId: 'org-1',
      role: 'owner',
    })
    assert.instanceOf(ownerRes, AuthorizationResponse)
    assert.equal((ownerRes as AuthorizationResponse).status, 422)

    // Cross-tenant target denied
    const crossRes = policy.remove(admin, {
      id: 'mem-agent',
      organizationId: 'org-2',
      role: 'agent',
    })
    assert.instanceOf(crossRes, AuthorizationResponse)
    assert.equal((crossRes as AuthorizationResponse).status, 404)
  })
})

test.group('Phase 3 Policies - RolePolicy', () => {
  const policy = new RolePolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('create and update check roles:manage and protect owner role', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['roles:manage'],
    })

    assert.isTrue(policy.create(admin))
    assert.isTrue(policy.update(admin, { roleKey: 'custom_role', organizationId: 'org-1' }))

    const ownerRes = policy.update(admin, { roleKey: 'owner', organizationId: 'org-1' })
    assert.instanceOf(ownerRes, AuthorizationResponse)
    assert.equal((ownerRes as AuthorizationResponse).status, 422)
  })

  test('destroy prevents deleting system roles', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['roles:manage'],
    })

    assert.isTrue(
      policy.destroy(admin, { roleKey: 'custom_role', isSystem: false, organizationId: 'org-1' })
    )

    const sysRes = policy.destroy(admin, { roleKey: 'agent', isSystem: true, organizationId: 'org-1' })
    assert.instanceOf(sysRes, AuthorizationResponse)
    assert.equal((sysRes as AuthorizationResponse).status, 422)
  })
})

test.group('Phase 3 Policies - ContactPolicy', () => {
  const policy = new ContactPolicy()

  test('checks permissions and tenant isolation', ({ assert }) => {
    const agent = makePrincipal({
      role: 'agent',
      orgId: 'org-1',
      permissions: ['contacts:view', 'contacts:create', 'contacts:edit', 'contacts:delete'],
    })

    assert.isTrue(policy.viewAny(agent))
    assert.isTrue(policy.view(agent, { organizationId: 'org-1', id: 'c-1' }))
    assert.isFalse(policy.view(agent, { organizationId: 'org-2', id: 'c-1' }))

    assert.isTrue(policy.create(agent))
    assert.isTrue(policy.update(agent, { organizationId: 'org-1', id: 'c-1' }))
    assert.isFalse(policy.update(agent, { organizationId: 'org-2', id: 'c-1' }))

    assert.isTrue(policy.delete(agent, { organizationId: 'org-1', id: 'c-1' }))
    assert.isFalse(policy.delete(agent, { organizationId: 'org-2', id: 'c-1' }))
  })
})

test.group('Phase 3 Policies - TagPolicy', () => {
  const policy = new TagPolicy()

  test('checks tag CRUD and contact assignment permissions', ({ assert }) => {
    const agent = makePrincipal({
      role: 'agent',
      orgId: 'org-1',
      permissions: ['contacts:view', 'contacts:create', 'contacts:edit', 'contacts:delete'],
    })

    assert.isTrue(policy.viewList(agent))
    assert.isTrue(policy.view(agent, { organizationId: 'org-1', id: 't-1' }))
    assert.isFalse(policy.view(agent, { organizationId: 'org-2', id: 't-1' }))

    assert.isTrue(policy.create(agent))
    assert.isTrue(policy.update(agent, { organizationId: 'org-1', id: 't-1' }))
    assert.isFalse(policy.update(agent, { organizationId: 'org-2', id: 't-1' }))

    assert.isTrue(policy.assignContact(agent, { organizationId: 'org-1', id: 't-1' }))
    assert.isFalse(policy.assignContact(agent, { organizationId: 'org-2', id: 't-1' }))

    assert.isTrue(policy.removeContact(agent, { organizationId: 'org-1', id: 't-1' }))
    assert.isFalse(policy.removeContact(agent, { organizationId: 'org-2', id: 't-1' }))

    assert.isTrue(policy.destroy(agent, { organizationId: 'org-1', id: 't-1' }))
    assert.isFalse(policy.destroy(agent, { organizationId: 'org-2', id: 't-1' }))
  })
})
