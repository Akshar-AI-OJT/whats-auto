/**
 * Central query-key factory for tenant-scoped and platform-admin caches.
 * Prefer these keys for all useQuery / invalidateQueries call sites.
 */
export const queryKeys = {
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
  admin: {
    organizations: (params?: Record<string, unknown>) =>
      ['admin', 'organizations', params ?? {}] as const,
    plans: (params?: Record<string, unknown>) => ['admin', 'plans', params ?? {}] as const,
    planDetail: (planId?: string | null) => ['admin', 'plans', 'detail', planId ?? 'none'] as const,
    subscriptions: (params?: Record<string, unknown>) =>
      ['admin', 'subscriptions', params ?? {}] as const,
    invoices: (params?: Record<string, unknown>) => ['admin', 'invoices', params ?? {}] as const,
    invoiceSummary: (params?: Record<string, unknown>) =>
      ['admin', 'invoices', 'summary', params ?? {}] as const,
  },
} as const

/** @deprecated Prefer `queryKeys.campaigns` — re-exported for gradual migration. */
export const campaignQueryKeys = queryKeys.campaigns

/** @deprecated Prefer `queryKeys.templates` — re-exported for gradual migration. */
export const templateQueryKeys = queryKeys.templates
