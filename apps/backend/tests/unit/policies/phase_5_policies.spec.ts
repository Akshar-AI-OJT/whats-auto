import { test } from '@japa/runner'
import MediaAssetPolicy from '#policies/media_asset_policy'
import KnowledgeDocumentPolicy from '#policies/knowledge_document_policy'
import NotificationPolicy from '#policies/notification_policy'
import BillingPolicy from '#policies/billing_policy'
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

test.group('Phase 5 Policies - MediaAssetPolicy', () => {
  const policy = new MediaAssetPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('viewList and view require media:view and check tenant isolation', ({ assert }) => {
    const agent = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['media:view'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewList(agent))
    assert.isFalse(policy.viewList(denied))
    assert.isTrue(policy.view(agent, { organizationId: 'org-1', id: 'med-1' }))
    assert.isFalse(policy.view(agent, { organizationId: 'org-2', id: 'med-1' }))
    assert.isFalse(policy.view(denied, { organizationId: 'org-1', id: 'med-1' }))
  })

  test('delete and restore require media:delete and deny agent or cross-tenant', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['media:delete'],
    })
    const agent = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['media:view'] })

    assert.isTrue(policy.delete(admin, { organizationId: 'org-1', id: 'med-1' }))
    assert.isFalse(policy.delete(agent, { organizationId: 'org-1', id: 'med-1' }))
    assert.isFalse(policy.delete(admin, { organizationId: 'org-2', id: 'med-1' }))

    assert.isTrue(
      policy.restore(admin, { organizationId: 'org-1', id: 'med-1', state: 'deleted' }) as boolean
    )
    assert.isFalse(
      policy.restore(agent, { organizationId: 'org-1', id: 'med-1', state: 'deleted' }) as boolean
    )
  })

  test('purge denies non-owner without media:purge and cross-tenant with 404', ({ assert }) => {
    const admin = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['media:delete'],
    })
    const purger = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['media:purge'],
    })

    const purgeNonOwner = policy.purge(admin, {
      organizationId: 'org-1',
      id: 'med-1',
      state: 'deleted',
    })
    assert.instanceOf(purgeNonOwner, AuthorizationResponse)
    assert.equal((purgeNonOwner as AuthorizationResponse).status, 403)

    assert.isTrue(
      policy.purge(purger, {
        organizationId: 'org-1',
        id: 'med-1',
        state: 'deleted',
      }) as boolean
    )

    const purgeCrossTenant = policy.purge(admin, {
      organizationId: 'org-2',
      id: 'med-1',
      state: 'deleted',
    })
    assert.instanceOf(purgeCrossTenant, AuthorizationResponse)
    assert.equal((purgeCrossTenant as AuthorizationResponse).status, 404)
  })
})

test.group('Phase 5 Policies - KnowledgeDocumentPolicy', () => {
  const policy = new KnowledgeDocumentPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('checks AI KB permissions and tenant isolation', ({ assert }) => {
    const viewer = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['ai:kb_view'] })
    const manager = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['ai:kb_view', 'ai:kb_manage'],
    })

    assert.isTrue(policy.viewList(viewer))
    assert.isTrue(policy.view(viewer, { organizationId: 'org-1', id: 'doc-1' }))
    assert.isFalse(policy.view(viewer, { organizationId: 'org-2', id: 'doc-1' }))

    assert.isFalse(policy.create(viewer))
    assert.isTrue(policy.create(manager))

    assert.isTrue(policy.completeUpload(manager, { organizationId: 'org-1', id: 'doc-1' }))
    assert.isFalse(policy.completeUpload(viewer, { organizationId: 'org-1', id: 'doc-1' }))

    assert.isTrue(policy.destroy(manager, { organizationId: 'org-1', id: 'doc-1' }))
    assert.isFalse(policy.destroy(viewer, { organizationId: 'org-1', id: 'doc-1' }))
  })
})

test.group('Phase 5 Policies - NotificationPolicy', () => {
  const policy = new NotificationPolicy()

  test('markAsRead allows own notifications and denies others', ({ assert }) => {
    const user = makePrincipal({ id: 'u-1', orgId: 'org-1', role: 'agent' })

    assert.isTrue(policy.viewList(user))
    assert.isTrue(policy.markAllAsRead(user))

    assert.isTrue(
      policy.markAsRead(user, { id: 'notif-1', userId: 'u-1', organizationId: 'org-1' })
    )
    assert.isFalse(
      policy.markAsRead(user, { id: 'notif-1', userId: 'u-2', organizationId: 'org-1' })
    )
    assert.isFalse(
      policy.markAsRead(user, { id: 'notif-1', userId: 'u-1', organizationId: 'org-2' })
    )
  })
})

test.group('Phase 5 Policies - BillingPolicy', () => {
  const policy = new BillingPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('checks billing permissions', ({ assert }) => {
    const viewer = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['billing:view'] })
    const manager = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['billing:manage'],
    })
    const unprivileged = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.checkout(manager))
    assert.isFalse(policy.checkout(viewer))

    assert.isTrue(policy.viewSubscription(viewer))
    assert.isTrue(policy.viewSubscription(manager))
    assert.isFalse(policy.viewSubscription(unprivileged))
  })
})
