/**
 * Application tables owned by the demo seed registry.
 * Keep in sync with Lucid schema.ts (*Schema exports) and demo_seed_plan.md.
 */
export const APPLICATION_TABLES = [
  'accounts',
  'authorization_audits',
  'contacts',
  'conversation_assignments',
  'conversation_notes',
  'conversations',
  'jwks',
  'media_assets',
  'message_templates',
  'messages',
  'organization_invitations',
  'organization_members',
  'organization_role_permissions',
  'organization_subscriptions',
  'organizations',
  'payment_transactions',
  'permissions',
  'plans',
  'role_permissions',
  'roles',
  'sessions',
  'usage_meters',
  'user_roles',
  'users',
  'verifications',
  'whatsapp_configs',
] as const

export type ApplicationTable = (typeof APPLICATION_TABLES)[number]

export type DemoSeedContext = {
  /** Stable plan IDs */
  plans: {
    starter: string
    growth: string
    scale: string
  }
  /** Org IDs */
  orgs: {
    northstar: string
    harbor: string
  }
  /** User IDs by email key */
  users: Record<string, string>
  /** Global role IDs by name */
  globalRoles: Record<string, string>
  /** Custom role IDs */
  customRoles: {
    northstarSupportLead: string
  }
  /** WhatsApp config IDs */
  whatsappConfigs: {
    northstarConnected: string
    northstarDisconnected: string
    harborError: string
  }
  /** Contact / conversation IDs used across modules */
  contacts: Record<string, string>
  conversations: Record<string, string>
  mediaAssets: Record<string, string>
  templates: Record<string, string>
  subscriptions: {
    northstar: string
    harbor: string
  }
}

export type DemoSeedModule = {
  id: string
  ownedTables: readonly ApplicationTable[]
  dependsOn: readonly string[]
  seed: (ctx: DemoSeedContext) => Promise<void>
}
