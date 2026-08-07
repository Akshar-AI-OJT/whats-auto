/**
 * Product (tenant) permissions — mirrors backend PRODUCT_PERMISSIONS.
 * Platform permissions are intentionally excluded from role editors.
 */
export const PRODUCT_PERMISSIONS = [
  'inbox:view',
  'inbox:reply',
  'inbox:assign',
  'inbox:close',
  'history:export',
  'contacts:view',
  'contacts:create',
  'contacts:edit',
  'contacts:delete',
  'contacts:import',
  'contacts:export',
  'media:view',
  'media:upload',
  'media:delete',
  'media:purge',
  'templates:view',
  'templates:create',
  'templates:edit',
  'templates:delete',
  'templates:sync',
  'campaigns:view',
  'campaigns:create',
  'campaigns:edit',
  'campaigns:pause',
  'campaigns:launch',
  'campaigns:delete',
  'automations:view',
  'automations:create',
  'automations:edit',
  'automations:delete',
  'automations:toggle',
  'ai:draft',
  'ai:kb_view',
  'ai:kb_manage',
  'ai:agent_manage',
  'notifications:manage',
  'analytics:view',
  'analytics:export',
  'org:view',
  'org:settings_manage',
  'org:delete',
  'team:view',
  'team:invite',
  'team:remove',
  'team:role_assign',
  'roles:view',
  'roles:manage',
  'billing:view',
  'billing:manage',
  'whatsapp:view',
  'whatsapp:manage',
  'whatsapp:connect',
  'integrations:view',
  'integrations:manage',
  'audit:view',
  'audit:export',
] as const

export type ProductPermission = (typeof PRODUCT_PERMISSIONS)[number]

export type PermissionGroup = {
  resource: string
  permissions: ProductPermission[]
}

/** Group `resource:action` permissions by resource for the editor UI. */
export function groupProductPermissions(
  permissions: readonly ProductPermission[] = PRODUCT_PERMISSIONS
): PermissionGroup[] {
  const map = new Map<string, ProductPermission[]>()
  for (const permission of permissions) {
    const resource = permission.split(':')[0] ?? permission
    const list = map.get(resource) ?? []
    list.push(permission)
    map.set(resource, list)
  }
  return [...map.entries()].map(([resource, perms]) => ({
    resource,
    permissions: perms,
  }))
}
