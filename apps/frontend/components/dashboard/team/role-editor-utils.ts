import { PRODUCT_PERMISSIONS, type ProductPermission } from '@/lib/product-permissions'

export type RoleTemplateId = 'admin' | 'manager' | 'agent' | 'custom'
export type CrudColumn = 'view' | 'create' | 'update' | 'delete'

export const RESOURCE_LABELS: Record<string, string> = {
  inbox: 'Conversations',
  contacts: 'Contacts',
  campaigns: 'Campaigns',
  templates: 'Templates',
  analytics: 'Reports',
  history: 'Reports',
  org: 'Organization',
  team: 'Users',
  ai: 'AI',
  automations: 'Automations',
  notifications: 'Notifications',
  roles: 'Roles & Permissions',
  billing: 'Billing',
  whatsapp: 'WhatsApp',
  integrations: 'Integrations',
  audit: 'Audit',
  media: 'Media',
}

export const RESOURCE_ORDER = [
  'inbox',
  'contacts',
  'campaigns',
  'templates',
  'reports',
  'org',
  'team',
  'ai',
  'automations',
  'notifications',
  'roles',
  'billing',
  'whatsapp',
  'integrations',
  'audit',
  'media',
] as const

export const PERMISSION_LABELS: Record<string, string> = {
  'inbox:view': 'View Conversations',
  'inbox:reply': 'Reply to Conversations',
  'inbox:assign': 'Assign Conversations',
  'inbox:close': 'Close Conversations',
  'contacts:view': 'View Contacts',
  'contacts:create': 'Create Contacts',
  'contacts:edit': 'Update Contacts',
  'contacts:delete': 'Delete Contacts',
  'contacts:import': 'Import Contacts',
  'contacts:export': 'Export Contacts',
  'campaigns:view': 'View Campaigns',
  'campaigns:create': 'Create Campaigns',
  'campaigns:edit': 'Update Campaigns',
  'campaigns:pause': 'Pause Campaigns',
  'campaigns:launch': 'Launch Campaigns',
  'campaigns:delete': 'Delete Campaigns',
  'templates:view': 'View Templates',
  'templates:create': 'Create Templates',
  'templates:edit': 'Update Templates',
  'templates:sync': 'Submit Templates to Meta',
  'templates:delete': 'Delete Templates',
  'analytics:view': 'View Dashboard',
  'analytics:export': 'Export Analytics',
  'history:export': 'Export Campaign Reports',
  'org:view': 'View Settings',
  'org:settings_manage': 'Edit Settings',
  'org:delete': 'Delete Organization',
  'team:view': 'View Users',
  'team:invite': 'Invite Users',
  'team:remove': 'Remove Users',
  'team:role_assign': 'Assign User Roles',
  'ai:draft': 'Generate Replies',
  'ai:kb_view': 'View Knowledge Base',
  'ai:kb_manage': 'Manage Knowledge Base',
  'ai:agent_manage': 'Generate Templates',
  'media:view': 'View Media',
  'media:upload': 'Upload Media',
  'media:delete': 'Delete Media',
  'media:purge': 'Purge Media',
  'automations:view': 'View Automations',
  'automations:create': 'Create Automations',
  'automations:edit': 'Update Automations',
  'automations:delete': 'Delete Automations',
  'automations:toggle': 'Toggle Automations',
  'notifications:manage': 'Manage Notifications',
  'roles:view': 'View Roles',
  'roles:manage': 'Manage Roles',
  'billing:view': 'View Billing',
  'billing:manage': 'Manage Billing',
  'whatsapp:view': 'View WhatsApp',
  'whatsapp:manage': 'Manage WhatsApp',
  'whatsapp:connect': 'Connect WhatsApp',
  'integrations:view': 'View Integrations',
  'integrations:manage': 'Manage Integrations',
  'audit:view': 'View Audit Logs',
  'audit:export': 'Export Audit Logs',
}

const ACTION_ORDER = [
  'view',
  'create',
  'edit',
  'reply',
  'assign',
  'close',
  'schedule',
  'pause',
  'launch',
  'sync',
  'import',
  'export',
  'invite',
  'remove',
  'role_assign',
  'draft',
  'kb_view',
  'kb_manage',
  'agent_manage',
  'upload',
  'purge',
  'toggle',
  'manage',
  'settings_manage',
  'connect',
  'delete',
] as const

/** Mirrors backend SEEDED_ROLES.admin — UI preset only, not a new API. */
const ADMIN_PRESET: readonly ProductPermission[] = [
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
  'team:view',
  'team:invite',
  'team:remove',
  'team:role_assign',
  'roles:view',
  'roles:manage',
  'billing:view',
  'whatsapp:view',
  'integrations:view',
  'integrations:manage',
  'audit:view',
]

/** Manager is a UI preset composed from existing product permissions. */
const MANAGER_PRESET: readonly ProductPermission[] = [
  'inbox:view',
  'inbox:assign',
  'inbox:close',
  'contacts:view',
  'contacts:create',
  'contacts:edit',
  'contacts:export',
  'campaigns:view',
  'campaigns:create',
  'campaigns:edit',
  'campaigns:pause',
  'campaigns:launch',
  'templates:view',
  'analytics:view',
  'analytics:export',
  'history:export',
  'team:view',
  'team:invite',
  'team:role_assign',
  'automations:view',
  'org:view',
  'media:view',
  'ai:kb_view',
]

/** Mirrors backend SEEDED_ROLES.agent — UI preset only. */
const AGENT_PRESET: readonly ProductPermission[] = [
  'inbox:view',
  'inbox:reply',
  'inbox:assign',
  'inbox:close',
  'contacts:view',
  'media:view',
  'media:upload',
  'templates:view',
  'campaigns:view',
  'automations:view',
  'ai:draft',
  'ai:kb_view',
  'org:view',
  'team:view',
]

const TEMPLATE_PRESETS: Record<Exclude<RoleTemplateId, 'custom'>, readonly ProductPermission[]> = {
  admin: ADMIN_PRESET,
  manager: MANAGER_PRESET,
  agent: AGENT_PRESET,
}

export function startCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export function resourceLabel(resource: string) {
  if (resource === 'reports') return 'Reports'
  return RESOURCE_LABELS[resource] ?? startCase(resource)
}

export function actionLabel(permission: string) {
  return PERMISSION_LABELS[permission] ?? startCase(permission.split(':')[1] ?? permission)
}

export function crudColumnForPermission(permission: string): CrudColumn {
  const action = permission.split(':')[1] ?? ''
  if (
    action === 'delete' ||
    action === 'remove' ||
    action === 'purge'
  ) {
    return 'delete'
  }
  if (
    action === 'create' ||
    action === 'reply' ||
    action === 'invite' ||
    action === 'draft' ||
    action === 'upload' ||
    action === 'import' ||
    action === 'connect'
  ) {
    return 'create'
  }
  if (action === 'view' || action === 'kb_view' || action === 'export') {
    return 'view'
  }
  return 'update'
}

export function sortPermissions(permissions: readonly string[]): string[] {
  return [...new Set(permissions)].sort((a, b) => {
    const actionA = a.split(':')[1] ?? ''
    const actionB = b.split(':')[1] ?? ''
    const idxA = ACTION_ORDER.indexOf(actionA as (typeof ACTION_ORDER)[number])
    const idxB = ACTION_ORDER.indexOf(actionB as (typeof ACTION_ORDER)[number])
    if (idxA === -1 && idxB === -1) return a.localeCompare(b)
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })
}

export function sortResources<T extends { resource: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const idxA = RESOURCE_ORDER.indexOf(a.resource as (typeof RESOURCE_ORDER)[number])
    const idxB = RESOURCE_ORDER.indexOf(b.resource as (typeof RESOURCE_ORDER)[number])
    if (idxA === -1 && idxB === -1) return a.resource.localeCompare(b.resource)
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })
}

export function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function grantablePreset(
  template: Exclude<RoleTemplateId, 'custom'>,
  grantable: readonly string[]
): string[] {
  const allowed = new Set(grantable)
  return TEMPLATE_PRESETS[template].filter((permission) => allowed.has(permission))
}

export function matchingTemplate(
  selected: Set<string>,
  grantable: readonly string[]
): RoleTemplateId {
  const ids: Array<Exclude<RoleTemplateId, 'custom'>> = ['admin', 'manager', 'agent']
  for (const id of ids) {
    if (setsEqual(selected, new Set(grantablePreset(id, grantable)))) return id
  }
  return 'custom'
}

export function isProductPermission(value: string): value is ProductPermission {
  return (PRODUCT_PERMISSIONS as readonly string[]).includes(value)
}
