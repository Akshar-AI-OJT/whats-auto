import { PERMISSIONS, type Permission } from './permissions.ts'

/**
 * Default role *templates* seeded when an organization is created.
 * Tenants edit these (and create custom roles) in Settings → Team & Access.
 * Permissions are not permanently fixed to these role keys — only the catalog
 * in permissions.ts is fixed in code.
 *
 * Intentionally withheld from Admin template (owner-only until product says otherwise):
 * - billing:manage
 * - whatsapp:connect
 */
export const SEEDED_ROLES: Array<{ role: string; displayName: string; permissions: Permission[] }> =
  [
    {
      role: 'admin',
      displayName: 'Admin',
      permissions: [
        PERMISSIONS.INBOX_VIEW,
        PERMISSIONS.INBOX_REPLY,
        PERMISSIONS.INBOX_ASSIGN,
        PERMISSIONS.INBOX_CLOSE,
        PERMISSIONS.CONTACTS_VIEW,
        PERMISSIONS.CONTACTS_CREATE,
        PERMISSIONS.CONTACTS_EDIT,
        PERMISSIONS.CONTACTS_DELETE,
        PERMISSIONS.CONTACTS_IMPORT,
        PERMISSIONS.TEMPLATES_VIEW,
        PERMISSIONS.TEMPLATES_CREATE,
        PERMISSIONS.TEMPLATES_EDIT,
        PERMISSIONS.TEMPLATES_DELETE,
        PERMISSIONS.TEMPLATES_SYNC,
        PERMISSIONS.CAMPAIGNS_VIEW,
        PERMISSIONS.CAMPAIGNS_CREATE,
        PERMISSIONS.CAMPAIGNS_LAUNCH,
        PERMISSIONS.CAMPAIGNS_DELETE,
        PERMISSIONS.AUTOMATIONS_VIEW,
        PERMISSIONS.AUTOMATIONS_CREATE,
        PERMISSIONS.AUTOMATIONS_EDIT,
        PERMISSIONS.AUTOMATIONS_DELETE,
        PERMISSIONS.AUTOMATIONS_TOGGLE,
        PERMISSIONS.AI_DRAFT,
        PERMISSIONS.AI_KB_VIEW,
        PERMISSIONS.AI_KB_MANAGE,
        PERMISSIONS.ANALYTICS_VIEW,
        PERMISSIONS.ANALYTICS_EXPORT,
        PERMISSIONS.TEAM_VIEW,
        PERMISSIONS.TEAM_INVITE,
        PERMISSIONS.TEAM_REMOVE,
        PERMISSIONS.TEAM_ROLE_ASSIGN,
        PERMISSIONS.ROLES_CREATE,
        PERMISSIONS.ROLES_EDIT,
        PERMISSIONS.ROLES_DELETE,
        PERMISSIONS.BILLING_VIEW,
        // PERMISSIONS.BILLING_MANAGE — withheld: owner-only billing mutations
        PERMISSIONS.INTEGRATIONS_VIEW,
        PERMISSIONS.INTEGRATIONS_MANAGE,
        // PERMISSIONS.WHATSAPP_CONNECT — withheld: owner-only WhatsApp account link
      ],
    },
    {
      role: 'agent',
      displayName: 'Agent',
      permissions: [
        PERMISSIONS.INBOX_VIEW,
        PERMISSIONS.INBOX_REPLY,
        PERMISSIONS.INBOX_ASSIGN,
        PERMISSIONS.INBOX_CLOSE,
        PERMISSIONS.CONTACTS_VIEW,
        PERMISSIONS.TEMPLATES_VIEW,
        PERMISSIONS.CAMPAIGNS_VIEW,
        PERMISSIONS.AUTOMATIONS_VIEW,
        PERMISSIONS.AI_DRAFT,
      ],
    },
    {
      role: 'viewer',
      displayName: 'Viewer',
      permissions: [PERMISSIONS.INBOX_VIEW, PERMISSIONS.CONTACTS_VIEW, PERMISSIONS.ANALYTICS_VIEW],
    },
  ]
