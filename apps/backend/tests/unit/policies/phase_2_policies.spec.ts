import { test } from '@japa/runner'
import ConversationPolicy from '#policies/conversation_policy'
import MessagePolicy from '#policies/message_policy'
import ConversationNotePolicy from '#policies/conversation_note_policy'
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

test.group('Phase 2 Policies - ConversationPolicy', () => {
  const policy = new ConversationPolicy()

  test('owner bypasses via before()', ({ assert }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })
    assert.isTrue(policy.before(owner))
  })

  test('viewAny checks inbox:view permission', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewAny(allowed))
    assert.isFalse(policy.viewAny(denied))
  })

  test('view checks organization isolation', ({ assert }) => {
    const agent = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.view(agent, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.view(agent, { organizationId: 'org-2', id: 'conv-1' }))
  })

  test('assign checks inbox:assign permission and org isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'admin', orgId: 'org-1', permissions: ['inbox:assign'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.assign(allowed, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.assign(denied, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.assign(allowed, { organizationId: 'org-2', id: 'conv-1' }))
  })

  test('close and reopen enforce status and org guards', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:close'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.close(allowed, { organizationId: 'org-1', id: 'conv-1', status: 'open' }))
    assert.instanceOf(
      policy.close(allowed, { organizationId: 'org-1', id: 'conv-1', status: 'closed' }),
      AuthorizationResponse
    )

    assert.isTrue(
      policy.reopen(allowed, { organizationId: 'org-1', id: 'conv-1', status: 'closed' })
    )
    assert.instanceOf(
      policy.reopen(allowed, { organizationId: 'org-1', id: 'conv-1', status: 'open' }),
      AuthorizationResponse
    )

    const closeDenied = policy.close(denied, {
      organizationId: 'org-1',
      id: 'conv-1',
      status: 'open',
    })
    assert.instanceOf(closeDenied, AuthorizationResponse)
    assert.equal((closeDenied as AuthorizationResponse).status, 403)

    const reopenCrossOrg = policy.reopen(allowed, {
      organizationId: 'org-2',
      id: 'conv-1',
      status: 'closed',
    })
    assert.instanceOf(reopenCrossOrg, AuthorizationResponse)
    assert.equal((reopenCrossOrg as AuthorizationResponse).status, 404)
  })

  test('takeoverAi and resumeAi check inbox:reply and tenant isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:reply'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.takeoverAi(allowed, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.takeoverAi(denied, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.takeoverAi(allowed, { organizationId: 'org-2', id: 'conv-1' }))

    assert.isTrue(policy.resumeAi(allowed, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.resumeAi(denied, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.resumeAi(allowed, { organizationId: 'org-2', id: 'conv-1' }))
  })
})

test.group('Phase 2 Policies - MessagePolicy', () => {
  const policy = new MessagePolicy()

  test('viewList checks inbox:view and tenant isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewList(allowed, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.viewList(denied, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.viewList(allowed, { organizationId: 'org-2', id: 'conv-1' }))
  })

  test('send checks inbox:reply and tenant isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:reply'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.send(allowed, { organizationId: 'org-1', id: 'conv-1' }))

    const sendDenied = policy.send(denied, { organizationId: 'org-1', id: 'conv-1' })
    assert.instanceOf(sendDenied, AuthorizationResponse)
    assert.equal((sendDenied as AuthorizationResponse).status, 403)

    const sendCrossOrg = policy.send(allowed, { organizationId: 'org-2', id: 'conv-1' })
    assert.instanceOf(sendCrossOrg, AuthorizationResponse)
    assert.equal((sendCrossOrg as AuthorizationResponse).status, 404)
  })
})

test.group('Phase 2 Policies - ConversationNotePolicy', () => {
  const policy = new ConversationNotePolicy()

  test('viewList checks inbox:view and tenant isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    assert.isTrue(policy.viewList(allowed, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.viewList(denied, { organizationId: 'org-1', id: 'conv-1' }))
    assert.isFalse(policy.viewList(allowed, { organizationId: 'org-2', id: 'conv-1' }))
  })

  test('create checks inbox:reply and tenant isolation', ({ assert }) => {
    const allowed = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:reply'] })
    const denied = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: ['inbox:view'] })

    assert.isTrue(policy.create(allowed, { organizationId: 'org-1', id: 'conv-1' }))

    const createDenied = policy.create(denied, { organizationId: 'org-1', id: 'conv-1' })
    assert.instanceOf(createDenied, AuthorizationResponse)
    assert.equal((createDenied as AuthorizationResponse).status, 403)

    const createCrossOrg = policy.create(allowed, { organizationId: 'org-2', id: 'conv-1' })
    assert.instanceOf(createCrossOrg, AuthorizationResponse)
    assert.equal((createCrossOrg as AuthorizationResponse).status, 404)
  })
})
