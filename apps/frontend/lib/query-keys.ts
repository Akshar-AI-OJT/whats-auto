export const queryKeys = {
  campaigns: {
    all: ['campaigns'] as const,
    list: (orgId: string | null | undefined, params: Record<string, unknown>) =>
      [...queryKeys.campaigns.all, 'list', orgId ?? 'none', params] as const,
    detail: (id: string) => [...queryKeys.campaigns.all, 'detail', id] as const,
  },
}
