import { test } from '@japa/runner'
import WhatsappConfigPolicy from '#policies/whatsapp_config_policy'
import MessageTemplatePolicy from '#policies/message_template_policy'
import CampaignPolicy from '#policies/campaign_policy'
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

test.group('Phase 4 Policies - WhatsappConfigPolicy', () => {
  const policy = new WhatsappConfigPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('viewList and view check permissions and tenant isolation', ({ assert }) => {
    const viewer = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['whatsapp:view'] })
    const unprivileged = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewList(viewer))
    assert.isFalse(policy.viewList(unprivileged))

    assert.isTrue(policy.view(viewer, { organizationId: 'org-1', id: 'cfg-1' }))
    assert.isFalse(policy.view(viewer, { organizationId: 'org-2', id: 'cfg-1' }))
  })

  test('disconnect and test check whatsapp:manage and tenant isolation', ({ assert }) => {
    const manager = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['whatsapp:manage'] })
    const viewer = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['whatsapp:view'] })

    assert.isTrue(policy.disconnect(manager, { organizationId: 'org-1', id: 'cfg-1' }))
    assert.isFalse(policy.disconnect(viewer, { organizationId: 'org-1', id: 'cfg-1' }))
    assert.isFalse(policy.disconnect(manager, { organizationId: 'org-2', id: 'cfg-1' }))

    assert.isTrue(policy.test(manager, { organizationId: 'org-1', id: 'cfg-1' }))
    assert.isFalse(policy.test(viewer, { organizationId: 'org-1', id: 'cfg-1' }))
  })
})

test.group('Phase 4 Policies - MessageTemplatePolicy', () => {
  const policy = new MessageTemplatePolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('checks template permissions and tenant isolation', ({ assert }) => {
    const creator = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['templates:create', 'templates:view'] })
    const syncer = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['templates:sync'] })
    const deleter = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['templates:delete'] })

    assert.isTrue(policy.viewList(creator))
    assert.isTrue(policy.view(creator, { organizationId: 'org-1', id: 'tpl-1' }))
    assert.isFalse(policy.view(creator, { organizationId: 'org-2', id: 'tpl-1' }))

    assert.isTrue(policy.create(creator))
    assert.isTrue(policy.sync(syncer))
    assert.isFalse(policy.sync(creator))

    assert.isTrue(policy.destroy(deleter, { organizationId: 'org-1', id: 'tpl-1' }))
    assert.isFalse(policy.destroy(creator, { organizationId: 'org-1', id: 'tpl-1' }))
  })
})

test.group('Phase 4 Policies - CampaignPolicy', () => {
  const policy = new CampaignPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('send validates permissions, tenant isolation, and status transition', ({ assert }) => {
    const launcher = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['campaigns:launch'] })
    const viewer = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['campaigns:view'] })

    // Valid draft/scheduled
    assert.isTrue(policy.send(launcher, { organizationId: 'org-1', id: 'camp-1', status: 'draft' }))
    assert.isTrue(policy.send(launcher, { organizationId: 'org-1', id: 'camp-1', status: 'scheduled' }))

    // Missing permission
    const denyPerm = policy.send(viewer, { organizationId: 'org-1', id: 'camp-1', status: 'draft' })
    assert.instanceOf(denyPerm, AuthorizationResponse)
    assert.equal((denyPerm as AuthorizationResponse).status, 403)

    // Cross-tenant
    const denyTenant = policy.send(launcher, { organizationId: 'org-2', id: 'camp-1', status: 'draft' })
    assert.instanceOf(denyTenant, AuthorizationResponse)
    assert.equal((denyTenant as AuthorizationResponse).status, 404)

    // Ineligible status (already sending)
    const denyStatus = policy.send(launcher, { organizationId: 'org-1', id: 'camp-1', status: 'sending' })
    assert.instanceOf(denyStatus, AuthorizationResponse)
    assert.equal((denyStatus as AuthorizationResponse).status, 422)
  })

  test('cancel validates pause permission and status transition', ({ assert }) => {
    const manager = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['campaigns:pause'] })

    // Eligible: scheduled or sending
    assert.isTrue(policy.cancel(manager, { organizationId: 'org-1', id: 'camp-1', status: 'scheduled' }))
    assert.isTrue(policy.cancel(manager, { organizationId: 'org-1', id: 'camp-1', status: 'sending' }))

    // Ineligible: draft
    const denyDraft = policy.cancel(manager, { organizationId: 'org-1', id: 'camp-1', status: 'draft' })
    assert.instanceOf(denyDraft, AuthorizationResponse)
    assert.equal((denyDraft as AuthorizationResponse).status, 422)
  })

  test('update and delete validate permissions and tenant isolation', ({ assert }) => {
    const editor = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['campaigns:edit', 'campaigns:delete'] })

    assert.isTrue(policy.update(editor, { organizationId: 'org-1', id: 'camp-1', status: 'draft' }))
    const updateSent = policy.update(editor, { organizationId: 'org-1', id: 'camp-1', status: 'sent' })
    assert.instanceOf(updateSent, AuthorizationResponse)
    assert.equal((updateSent as AuthorizationResponse).status, 422)

    assert.isTrue(policy.delete(editor, { organizationId: 'org-1', id: 'camp-1' }))
  })
})
