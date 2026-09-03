/**
 * Central query-key factory for tenant-scoped and platform-admin caches.
 * Prefer these keys for all useQuery / invalidateQueries call sites.
 * Prefix strings are kept stable for cache continuity with prior colocated keys.
 */
export const queryKeys = {
  organizations: {
    all: ['organizations'] as const,
    list: (userId?: string | null) =>
      [...queryKeys.organizations.all, userId ?? 'anonymous', 'list'] as const,
    accessContext: (userId?: string | null) =>
      [...queryKeys.organizations.all, userId ?? 'anonymous', 'access-context'] as const,
    ownershipMembers: (orgId?: string | null) =>
      [...queryKeys.organizations.all, 'ownership-members', orgId ?? null] as const,
    smtp: (orgId?: string | null) =>
      [...queryKeys.organizations.all, 'smtp', orgId ?? null] as const,
  },
  profile: {
    all: ['account-profile'] as const,
    detail: () => [...queryKeys.profile.all, 'detail'] as const,
  },
  contacts: {
    all: (orgId?: string | null) => ['contacts', orgId ?? 'none'] as const,
    list: (orgId?: string | null, query?: string) =>
      [...queryKeys.contacts.all(orgId), 'list', { query: query ?? '' }] as const,
  },
  team: {
    all: (orgId?: string | null) => ['team', orgId ?? 'none'] as const,
    list: (orgId?: string | null, params?: Record<string, unknown>) =>
      [...queryKeys.team.all(orgId), 'list', params ?? {}] as const,
    invites: (orgId?: string | null) => [...queryKeys.team.all(orgId), 'invites'] as const,
    members: (orgId?: string | null) => [...queryKeys.team.all(orgId), 'members'] as const,
    /** GET /api/v1/organization-admin/users/:userId */
    userDetail: (orgId?: string | null, userId?: string | null) =>
      [...queryKeys.team.all(orgId), 'user', userId ?? 'none'] as const,
  },
  roles: {
    all: (orgId?: string | null) => ['roles', orgId ?? 'none'] as const,
    list: (orgId?: string | null) => [...queryKeys.roles.all(orgId), 'list'] as const,
    detail: (orgId?: string | null, roleKey?: string) =>
      [...queryKeys.roles.all(orgId), 'detail', roleKey ?? 'none'] as const,
  },
  notifications: {
    all: (orgId?: string | null) => ['notifications', orgId ?? 'none'] as const,
    list: (orgId?: string | null, page?: number) =>
      [...queryKeys.notifications.all(orgId), 'list', { page: page ?? 1 }] as const,
  },
  billing: {
    all: ['billing'] as const,
    subscription: (orgId?: string | null) =>
      [...queryKeys.billing.all, 'subscription', orgId ?? 'none'] as const,
    plans: (orgId?: string | null) =>
      [...queryKeys.billing.all, 'plans', orgId ?? 'none'] as const,
    entitlements: (orgId?: string | null) =>
      [...queryKeys.billing.all, 'entitlements', orgId ?? 'none'] as const,
  },
  whatsapp: {
    configs: (orgId?: string | null) => ['whatsapp-configs', orgId ?? 'none'] as const,
    templates: (orgId?: string | null) => ['whatsapp-templates', orgId ?? 'none'] as const,
  },
  /** Message templates (Meta) — prefix kept as `whatsapp-templates` for cache continuity. */
  templates: {
    all: ['whatsapp-templates'] as const,
    list: (orgId?: string | null, params?: Record<string, string | number>) =>
      [...queryKeys.templates.all, 'list', orgId ?? 'none', params ?? {}] as const,
    detail: (id: string) => [...queryKeys.templates.all, 'detail', id] as const,
    whatsappConnected: (orgId?: string | null) =>
      [...queryKeys.templates.all, 'whatsapp-connected', orgId ?? 'none'] as const,
  },
  media: {
    all: ['media-library'] as const,
    list: (orgId?: string | null, params?: Record<string, string | number>) =>
      [...queryKeys.media.all, 'list', orgId ?? 'none', params ?? {}] as const,
    quota: (orgId?: string | null) =>
      [...queryKeys.media.all, 'quota', orgId ?? 'none'] as const,
  },
  knowledge: {
    all: ['knowledge-documents'] as const,
    list: (orgId?: string | null, params?: Record<string, string | number>) =>
      [...queryKeys.knowledge.all, 'list', orgId ?? 'none', params ?? {}] as const,
    quota: (orgId?: string | null) =>
      [...queryKeys.knowledge.all, 'quota', orgId ?? 'none'] as const,
  },
  flows: {
    all: ['flows'] as const,
    list: (orgId?: string | null, params?: Record<string, string | number>) =>
      [...queryKeys.flows.all, 'list', orgId ?? 'none', params ?? {}] as const,
    detail: (orgId?: string | null, id?: string | null) =>
      [...queryKeys.flows.all, 'detail', orgId ?? 'none', id ?? 'none'] as const,
  },
  customerGroups: {
    all: ['customer-groups'] as const,
    list: (organizationId?: string | null) =>
      [...queryKeys.customerGroups.all, 'list', organizationId ?? 'none'] as const,
    summary: (organizationId?: string | null) =>
      [...queryKeys.customerGroups.all, 'summary', organizationId ?? 'none'] as const,
    detail: (organizationId?: string | null, id?: string) =>
      [...queryKeys.customerGroups.all, 'detail', organizationId ?? 'none', id ?? 'none'] as const,
    members: (organizationId?: string | null, id?: string) =>
      [...queryKeys.customerGroups.all, 'members', organizationId ?? 'none', id ?? 'none'] as const,
    contacts: (organizationId?: string | null) =>
      [...queryKeys.customerGroups.all, 'contacts', organizationId ?? null] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: (orgId?: string | null, params?: Record<string, string | number>) =>
      [...queryKeys.campaigns.all, 'list', orgId ?? 'none', params ?? {}] as const,
    detail: (id: string) => [...queryKeys.campaigns.all, 'detail', id] as const,
  },
  inbox: {
    all: (orgId?: string | null) => ['inbox', orgId ?? 'none'] as const,
    lists: (orgId?: string | null) => [...queryKeys.inbox.all(orgId), 'list'] as const,
    list: (
      orgId?: string | null,
      params?: {
        page?: number
        search?: string
        status?: string
        assignedAgentId?: string
      }
    ) => [...queryKeys.inbox.lists(orgId), params ?? {}] as const,
    detail: (orgId?: string | null, conversationId?: string) =>
      [...queryKeys.inbox.all(orgId), 'detail', conversationId ?? 'none'] as const,
    messages: (orgId?: string | null, conversationId?: string) =>
      [...queryKeys.inbox.all(orgId), 'messages', conversationId ?? 'none'] as const,
    notes: (orgId?: string | null, conversationId?: string) =>
      [...queryKeys.inbox.all(orgId), 'notes', conversationId ?? 'none'] as const,
  },
  integrations: {
    all: (orgId?: string | null) => ['integrations', orgId ?? 'none'] as const,
    connections: (orgId?: string | null) =>
      [...queryKeys.integrations.all(orgId), 'connections'] as const,
    apiKeys: (orgId?: string | null) => [...queryKeys.integrations.all(orgId), 'api-keys'] as const,
  },
  analytics: {
    all: ['tenant-analytics'] as const,
    contacts: ['tenant-analytics', 'contacts'] as const,
    campaigns: ['tenant-analytics', 'campaigns'] as const,
    templates: ['tenant-analytics', 'templates'] as const,
    configs: ['tenant-analytics', 'configs'] as const,
    conversations: ['tenant-analytics', 'conversations'] as const,
    tags: ['tenant-analytics', 'tags'] as const,
    audit: ['tenant-analytics', 'audit'] as const,
  },
  overview: {
    all: ['dashboard-overview'] as const,
    contacts: (organizationId?: string | null) =>
      ['dashboard-overview', 'contacts', organizationId ?? null] as const,
    conversations: (organizationId?: string | null) =>
      ['dashboard-overview', 'conversations', organizationId ?? null] as const,
    campaigns: (organizationId?: string | null) =>
      ['dashboard-overview', 'campaigns', organizationId ?? null] as const,
    audit: (organizationId?: string | null) =>
      ['dashboard-overview', 'audit', organizationId ?? null] as const,
  },
  audit: {
    org: (orgId?: string | null, limit?: number) =>
      ['org-audit-logs', orgId ?? null, limit ?? 50] as const,
  },
  onboarding: {
    plans: ['onboarding', 'plans'] as const,
    billingSubscription: ['onboarding', 'billing', 'subscription'] as const,
  },
  search: {
    all: ['global-search'] as const,
    query: (scope: 'organization' | 'platform', q: string) =>
      [...queryKeys.search.all, scope, q] as const,
  },
  admin: {
    organizations: (params?: Record<string, unknown>) =>
      ['admin', 'organizations', params ?? {}] as const,
    organizationActivity: (organizationId?: string | null) =>
      ['admin-org-activity', organizationId ?? null] as const,
    /** Prefix for invalidating all plan list/detail queries. */
    plansRoot: ['admin', 'plans'] as const,
    plans: (params?: Record<string, unknown>) => ['admin', 'plans', params ?? {}] as const,
    planDetail: (planId?: string | null) => ['admin', 'plans', 'detail', planId ?? 'none'] as const,
    subscriptions: (params?: Record<string, unknown>) =>
      ['admin', 'subscriptions', params ?? {}] as const,
    subscriptionDetail: (subscriptionId?: string | null) =>
      ['admin', 'subscriptions', 'detail', subscriptionId ?? 'none'] as const,
    /** Prefix for invalidating all invoice list/summary queries. */
    invoicesRoot: ['admin', 'invoices'] as const,
    invoices: (params?: Record<string, unknown>) => ['admin', 'invoices', params ?? {}] as const,
    invoiceSummary: (params?: Record<string, unknown>) =>
      ['admin', 'invoices', 'summary', params ?? {}] as const,
    platformUsers: (params?: Record<string, unknown>) =>
      ['admin', 'platform-users', params ?? {}] as const,
    auditLogs: (limit?: number, organizationId?: string | null) =>
      ['admin-audit-logs', limit ?? 50, organizationId ?? null] as const,
    auditLogOrganizations: ['admin-audit-log-organizations'] as const,
    analytics: {
      all: ['super-admin-analytics'] as const,
      organizations: ['super-admin-analytics', 'organizations'] as const,
      subscriptions: ['super-admin-analytics', 'subscriptions'] as const,
      plans: ['super-admin-analytics', 'plans'] as const,
      invoiceSummary: ['super-admin-analytics', 'invoice-summary'] as const,
      currentMonthPaidRevenue: ['super-admin-analytics', 'current-month-paid-revenue'] as const,
      platformUsersTotal: ['super-admin-analytics', 'platform-users-total'] as const,
      platformUsers: ['super-admin-analytics', 'platform-users'] as const,
      audit: ['super-admin-analytics', 'audit'] as const,
      monthlyRevenue: (locale: string, months = 6) =>
        ['super-admin-analytics', 'monthly-revenue', locale, months] as const,
    },
    aiConfig: ['admin', 'ai-config'] as const,
  },
} as const
