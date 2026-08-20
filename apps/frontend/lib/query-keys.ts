/**
 * Central query-key factory for tenant-scoped caches.
 * Prefer these keys for all useQuery / invalidateQueries call sites.
 * Scoped by organization id where data is tenant-isolated.
 */
export const queryKeys = {
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
} as const
