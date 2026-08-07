/**
 * Frontend RBAC helpers — permission keys must match
 * `apps/backend/app/abilities/permissions.ts` exactly.
 */

export const PERMISSIONS = {
  INBOX_VIEW: 'inbox:view',
  INBOX_REPLY: 'inbox:reply',
  INBOX_ASSIGN: 'inbox:assign',
  INBOX_CLOSE: 'inbox:close',
  CONTACTS_VIEW: 'contacts:view',
  CONTACTS_CREATE: 'contacts:create',
  CONTACTS_EDIT: 'contacts:edit',
  CONTACTS_DELETE: 'contacts:delete',
  MEDIA_VIEW: 'media:view',
  MEDIA_UPLOAD: 'media:upload',
  MEDIA_DELETE: 'media:delete',
  MEDIA_PURGE: 'media:purge',
  TEMPLATES_VIEW: 'templates:view',
  CAMPAIGNS_VIEW: 'campaigns:view',
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_EDIT: 'campaigns:edit',
  CAMPAIGNS_DELETE: 'campaigns:delete',
  CAMPAIGNS_PAUSE: 'campaigns:pause',
  CAMPAIGNS_LAUNCH: 'campaigns:launch',
  ANALYTICS_VIEW: 'analytics:view',
  ORG_VIEW: 'org:view',
  ORG_SETTINGS_MANAGE: 'org:settings_manage',
  ORG_DELETE: 'org:delete',
  TEAM_VIEW: 'team:view',
  TEAM_INVITE: 'team:invite',
  TEAM_REMOVE: 'team:remove',
  TEAM_ROLE_ASSIGN: 'team:role_assign',
  ROLES_VIEW: 'roles:view',
  ROLES_MANAGE: 'roles:manage',
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',
  WHATSAPP_VIEW: 'whatsapp:view',
  WHATSAPP_MANAGE: 'whatsapp:manage',
  WHATSAPP_CONNECT: 'whatsapp:connect',
  AUDIT_VIEW: 'audit:view',
  PLATFORM_TENANTS_VIEW: 'platform:tenants_view',
} as const

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | (string & {})

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  permission: string
): boolean {
  if (!permissions || permissions.length === 0) return false
  return permissions.includes(permission)
}

export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  required: readonly string[]
): boolean {
  if (!permissions || permissions.length === 0 || required.length === 0) return false
  return required.some((permission) => permissions.includes(permission))
}

export function hasAllPermissions(
  permissions: readonly string[] | null | undefined,
  required: readonly string[]
): boolean {
  if (!permissions || permissions.length === 0) return false
  if (required.length === 0) return true
  return required.every((permission) => permissions.includes(permission))
}
