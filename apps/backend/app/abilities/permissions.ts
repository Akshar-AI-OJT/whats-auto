export const PERMISSIONS = {
  PLATFORM_TENANTS_VIEW: 'platform:tenants_view',
  PLATFORM_TENANTS_UPDATE: 'platform:tenants_update',
  PLATFORM_TENANTS_SUSPEND: 'platform:tenants_suspend',
  PLATFORM_TENANTS_DELETE: 'platform:tenants_delete',
  PLATFORM_TENANTS_BILLING: 'platform:tenants_billing',
  PLATFORM_METRICS_VIEW: 'platform:metrics_view',
  PLATFORM_ADMINS_MANAGE: 'platform:admins_manage',
  PLATFORM_CONFIG_VIEW: 'platform:config_view',
  PLATFORM_CONFIG_MANAGE: 'platform:config_manage',
  PLATFORM_AUDIT_VIEW: 'platform:audit_view',

  INBOX_VIEW: 'inbox:view',
  INBOX_REPLY: 'inbox:reply',
  INBOX_ASSIGN: 'inbox:assign',
  INBOX_CLOSE: 'inbox:close',
  HISTORY_EXPORT: 'history:export',

  CONTACTS_VIEW: 'contacts:view',
  CONTACTS_CREATE: 'contacts:create',
  CONTACTS_EDIT: 'contacts:edit',
  CONTACTS_DELETE: 'contacts:delete',
  CONTACTS_IMPORT: 'contacts:import',
  CONTACTS_EXPORT: 'contacts:export',

  MEDIA_UPLOAD: 'media:upload',

  TEMPLATES_VIEW: 'templates:view',
  TEMPLATES_CREATE: 'templates:create',
  TEMPLATES_EDIT: 'templates:edit',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_SYNC: 'templates:sync',

  CAMPAIGNS_VIEW: 'campaigns:view',
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_EDIT: 'campaigns:edit',
  CAMPAIGNS_PAUSE: 'campaigns:pause',
  CAMPAIGNS_LAUNCH: 'campaigns:launch',
  CAMPAIGNS_DELETE: 'campaigns:delete',

  AUTOMATIONS_VIEW: 'automations:view',
  AUTOMATIONS_CREATE: 'automations:create',
  AUTOMATIONS_EDIT: 'automations:edit',
  AUTOMATIONS_DELETE: 'automations:delete',
  AUTOMATIONS_TOGGLE: 'automations:toggle',

  AI_DRAFT: 'ai:draft',
  AI_KB_VIEW: 'ai:kb_view',
  AI_KB_MANAGE: 'ai:kb_manage', // manages documents like faq, policies
  AI_AGENT_MANAGE: 'ai:agent_manage', //manages agent itself

  NOTIFICATIONS_MANAGE: 'notifications:manage', // tenant scoped org-wide alert config — not personal prefs

  ANALYTICS_VIEW: 'analytics:view',
  ANALYTICS_EXPORT: 'analytics:export',

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

  INTEGRATIONS_VIEW: 'integrations:view',
  INTEGRATIONS_MANAGE: 'integrations:manage',

  AUDIT_LOG_VIEW: 'audit:view',
  AUDIT_LOG_EXPORT: 'audit:export',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
export const PRODUCT_PERMISSIONS = Object.values(PERMISSIONS).filter(
  (p) => !p.startsWith('platform:')
) as Permission[]

export const PLATFORM_PERMISSIONS = Object.values(PERMISSIONS).filter((p) =>
  p.startsWith('platform:')
) as Permission[]
