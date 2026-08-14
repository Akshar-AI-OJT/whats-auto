import { test } from '@japa/runner'
import OrganizationAdminUserPolicy from '#policies/organization_admin_user_policy'
import OwnershipPolicy from '#policies/ownership_policy'
import OrganizationPolicy from '#policies/organization_policy'
import InvitationPolicy from '#policies/invitation_policy'
import ConversationPolicy from '#policies/conversation_policy'
import MessagePolicy from '#policies/message_policy'
import ConversationNotePolicy from '#policies/conversation_note_policy'
import MemberPolicy from '#policies/member_policy'
import RolePolicy from '#policies/role_policy'
import ContactPolicy from '#policies/contact_policy'
import TagPolicy from '#policies/tag_policy'
import WhatsappConfigPolicy from '#policies/whatsapp_config_policy'
import MessageTemplatePolicy from '#policies/message_template_policy'
import CampaignPolicy from '#policies/campaign_policy'
import MediaAssetPolicy from '#policies/media_asset_policy'
import KnowledgeDocumentPolicy from '#policies/knowledge_document_policy'
import NotificationPolicy from '#policies/notification_policy'
import BillingPolicy from '#policies/billing_policy'
import SuperAdminPolicy from '#policies/super_admin_policy'
import AuditPolicy from '#policies/audit_policy'
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

test.group('Phase 7 - Comprehensive Policy Edge Cases & Invariant Matrix', () => {
  test('Principal with no active organization or permissions is safely denied across all policies', ({
    assert,
  }) => {
    const anonymousPrincipal = makePrincipal({ id: 'anon', role: undefined, permissions: [] })

    const orgAdminUserPolicy = new OrganizationAdminUserPolicy()
    const viewAnyOrgAdminRes = orgAdminUserPolicy.viewAny(anonymousPrincipal)
    assert.instanceOf(viewAnyOrgAdminRes, AuthorizationResponse)

    const ownershipPolicy = new OwnershipPolicy()
    const transferRes = ownershipPolicy.transfer(anonymousPrincipal)
    assert.instanceOf(transferRes, AuthorizationResponse)

    const orgPolicy = new OrganizationPolicy()
    assert.isTrue(orgPolicy.setActive(anonymousPrincipal))
    const updateOrgRes = orgPolicy.update(anonymousPrincipal, 'org-1')
    assert.instanceOf(updateOrgRes, AuthorizationResponse)
    const deleteOrgRes = orgPolicy.delete(anonymousPrincipal, 'org-1')
    assert.instanceOf(deleteOrgRes, AuthorizationResponse)

    const invitePolicy = new InvitationPolicy()
    assert.isFalse(invitePolicy.viewAny(anonymousPrincipal))

    const convoPolicy = new ConversationPolicy()
    assert.isFalse(convoPolicy.viewAny(anonymousPrincipal))
    assert.isFalse(convoPolicy.view(anonymousPrincipal, { organizationId: 'org-1' }))
    assert.isFalse(convoPolicy.assign(anonymousPrincipal, { organizationId: 'org-1' }))

    const msgPolicy = new MessagePolicy()
    assert.isFalse(msgPolicy.viewList(anonymousPrincipal, { organizationId: 'org-1' }))
    const sendMsgRes = msgPolicy.send(anonymousPrincipal, { organizationId: 'org-1' })
    assert.instanceOf(sendMsgRes, AuthorizationResponse)

    const convoNotePolicy = new ConversationNotePolicy()
    assert.isFalse(convoNotePolicy.viewList(anonymousPrincipal, { organizationId: 'org-1' }))

    const memberPolicy = new MemberPolicy()
    assert.isFalse(memberPolicy.viewList(anonymousPrincipal))
    const assignRes = memberPolicy.assignRole(anonymousPrincipal)
    assert.instanceOf(assignRes, AuthorizationResponse)

    const rolePolicy = new RolePolicy()
    assert.isFalse(rolePolicy.viewList(anonymousPrincipal))
    const createRoleRes = rolePolicy.create(anonymousPrincipal)
    assert.instanceOf(createRoleRes, AuthorizationResponse)

    const contactPolicy = new ContactPolicy()
    assert.isFalse(contactPolicy.viewAny(anonymousPrincipal))
    assert.isFalse(contactPolicy.create(anonymousPrincipal))

    const tagPolicy = new TagPolicy()
    assert.isFalse(tagPolicy.viewList(anonymousPrincipal))
    assert.isFalse(tagPolicy.create(anonymousPrincipal))

    const waPolicy = new WhatsappConfigPolicy()
    assert.isFalse(waPolicy.viewList(anonymousPrincipal))
    assert.isFalse(waPolicy.connect(anonymousPrincipal))

    const tplPolicy = new MessageTemplatePolicy()
    assert.isFalse(tplPolicy.viewList(anonymousPrincipal))
    assert.isFalse(tplPolicy.create(anonymousPrincipal))

    const campPolicy = new CampaignPolicy()
    assert.isFalse(campPolicy.viewList(anonymousPrincipal))
    assert.isFalse(campPolicy.create(anonymousPrincipal))

    const mediaPolicy = new MediaAssetPolicy()
    assert.isFalse(mediaPolicy.viewList(anonymousPrincipal))
    assert.isFalse(mediaPolicy.delete(anonymousPrincipal, { organizationId: 'org-1' }))

    const kbPolicy = new KnowledgeDocumentPolicy()
    assert.isFalse(kbPolicy.viewList(anonymousPrincipal))
    assert.isFalse(kbPolicy.create(anonymousPrincipal))

    const notifPolicy = new NotificationPolicy()
    assert.isTrue(notifPolicy.viewList(anonymousPrincipal))

    const billingPolicy = new BillingPolicy()
    assert.isFalse(billingPolicy.checkout(anonymousPrincipal))
    assert.isFalse(billingPolicy.viewSubscription(anonymousPrincipal))

    const superAdminPolicy = new SuperAdminPolicy()
    assert.isFalse(superAdminPolicy.viewTenants(anonymousPrincipal))
    assert.isFalse(superAdminPolicy.manageBilling(anonymousPrincipal))

    const auditPolicy = new AuditPolicy()
    assert.isFalse(auditPolicy.view(anonymousPrincipal, 'org-1'))
  })

  test('Owner role uniformly bypasses all resource checks on tenant-scoped policies', ({
    assert,
  }) => {
    const owner = makePrincipal({ role: 'owner', orgId: 'org-1' })

    assert.isTrue(new OrganizationPolicy().before(owner))
    assert.isTrue(new ConversationPolicy().before(owner))
    assert.isTrue(new MessagePolicy().before(owner))
    assert.isTrue(new ConversationNotePolicy().before(owner))
    assert.isTrue(new MemberPolicy().before(owner))
    assert.isTrue(new RolePolicy().before(owner))
    assert.isTrue(new ContactPolicy().before(owner))
    assert.isTrue(new TagPolicy().before(owner))
    assert.isTrue(new WhatsappConfigPolicy().before(owner))
    assert.isTrue(new MessageTemplatePolicy().before(owner))
    assert.isTrue(new CampaignPolicy().before(owner))
    assert.isTrue(new MediaAssetPolicy().before(owner))
    assert.isTrue(new KnowledgeDocumentPolicy().before(owner))
    assert.isTrue(new BillingPolicy().before(owner))
  })

  test('Media upload and WhatsApp connect actions evaluate properly', ({ assert }) => {
    const mediaUploader = makePrincipal({
      role: 'agent',
      orgId: 'org-1',
      permissions: ['media:upload'],
    })
    const waConnector = makePrincipal({
      role: 'admin',
      orgId: 'org-1',
      permissions: ['whatsapp:connect'],
    })
    const unprivileged = makePrincipal({ role: 'agent', orgId: 'org-1', permissions: [] })

    const mediaPolicy = new MediaAssetPolicy()
    assert.isTrue(mediaPolicy.upload(mediaUploader))
    assert.isFalse(mediaPolicy.upload(unprivileged))

    const waPolicy = new WhatsappConfigPolicy()
    assert.isTrue(waPolicy.connect(waConnector))
    assert.isFalse(waPolicy.connect(unprivileged))
  })
})
