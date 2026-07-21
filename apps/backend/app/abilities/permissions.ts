export const PERMISSIONS = {
  INBOX_VIEW: 'inbox:view',
  INBOX_REPLY: 'inbox:reply',
  INBOX_ASSIGN: 'inbox:assign',
  INBOX_CLOSE: 'inbox:close',

  CONTACTS_VIEW: 'contacts:view',
  CONTACTS_CREATE: 'contacts:create',
  CONTACTS_EDIT: 'contacts:edit',
  CONTACTS_DELETE: 'contacts:delete',
  CONTACTS_IMPORT: 'contacts:import',

  TEMPLATES_VIEW: 'templates:view',
  TEMPLATES_CREATE: 'templates:create',
  TEMPLATES_EDIT: 'templates:edit',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_SYNC: 'templates:sync',

  CAMPAIGNS_VIEW: 'campaigns:view',
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_LAUNCH: 'campaigns:launch',
  CAMPAIGNS_DELETE: 'campaigns:delete',

  AUTOMATIONS_VIEW: 'automations:view',
  AUTOMATIONS_CREATE: 'automations:create',
  AUTOMATIONS_EDIT: 'automations:edit',
  AUTOMATIONS_DELETE: 'automations:delete',
  AUTOMATIONS_TOGGLE: 'automations:toggle',

  AI_DRAFT: 'ai:draft',
  AI_KB_VIEW: 'ai:kb_view',
  AI_KB_MANAGE: 'ai:kb_manage',

  ANALYTICS_VIEW: 'analytics:view',
  ANALYTICS_EXPORT: 'analytics:export',

  TEAM_VIEW: 'team:view',
  TEAM_INVITE: 'team:invite',
  TEAM_REMOVE: 'team:remove',
  TEAM_ROLE_ASSIGN: 'team:role_assign',
  ROLES_CREATE: 'roles:create',
  ROLES_EDIT: 'roles:edit',
  ROLES_DELETE: 'roles:delete',

  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',

  INTEGRATIONS_VIEW: 'integrations:view',
  INTEGRATIONS_MANAGE: 'integrations:manage',
  WHATSAPP_CONNECT: 'whatsapp:connect',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[]

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS)

/**
 * Convert flat 'resource:action' strings to Better Auth's resource/action JSON format.
 * Used when seeding or updating organization_roles.permission column.
 *
 * Input:  ['inbox:view', 'inbox:reply', 'contacts:view']
 * Output: { inbox: ['view', 'reply'], contacts: ['view'] }
 */
export function toPermissionJson(permissions: Permission[]): Record<string, string[]> {
  return permissions.reduce<Record<string, string[]>>((acc, perm) => {
    const [resource, action] = perm.split(':')
    acc[resource] = acc[resource] ? [...acc[resource], action] : [action]
    return acc
  }, {})
}

/**
 * Storage shape for organization_roles.permission.
 * Bridges product `team:invite` → Better Auth invite endpoints (`invitation:create|cancel`)
 * so Better-Auth /organization/invite works with dynamic roles.
 */
export function toStoredPermissionJson(permissions: Permission[]): Record<string, string[]> {
  const json = toPermissionJson(permissions)
  if (permissions.includes(PERMISSIONS.TEAM_INVITE)) {
    json.invitation = [...new Set([...(json.invitation ?? []), 'create', 'cancel'])]
  }
  return json
}

/**
 * Convert Better Auth's resource/action JSON back to flat product permissions.
 * Drops Better-Auth-only keys (e.g. invitation:create) so access-context stays product-scoped.
 */
export function fromPermissionJson(json: Record<string, string[]>): Permission[] {
  return Object.entries(json).flatMap(([resource, actions]) =>
    actions
      .map((action) => `${resource}:${action}`)
      .filter((perm): perm is Permission => KNOWN_PERMISSIONS.has(perm))
  )
}
