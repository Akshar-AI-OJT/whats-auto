export const PLATFORM_AUDIT_EVENT_TYPES = [
  'organization.created',
  'organization.updated',
  'organization.soft_deleted',
  'ownership.transferred',
  'subscription.created',
  'subscription.updated',
  'subscription.cancelled',
  'invoice.created',
  'invoice.marked_paid',
  'plan.created',
  'plan.updated',
  'ai_config.updated',
] as const

export const TENANT_AUDIT_EVENT_TYPES = [
  'role.created',
  'role.updated',
  'role.reset',
  'role.deleted',
  'role.permission_override',
  'org_role_permission.granted',
  'org_role_permission.revoked',
  'member.role_assigned',
  'member.removed',
  'user.updated',
  'invitation.created',
  'invitation.accepted',
  'invitation.rejected',
  'invitation.canceled',
] as const

export type AuditListScope = 'platform' | 'tenant'

export function eventTypesForScope(scope: AuditListScope): readonly string[] {
  return scope === 'platform' ? PLATFORM_AUDIT_EVENT_TYPES : TENANT_AUDIT_EVENT_TYPES
}
