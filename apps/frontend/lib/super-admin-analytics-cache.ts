import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

/**
 * BUG-021: Dashboard/Analytics live under `queryKeys.admin.analytics.*`
 * (`['super-admin-analytics', ...]`), not `['admin', ...]`.
 * Invalidating the analytics root marks every KPI query stale and bypasses staleTime.
 */
export const ANALYTICS_INVALIDATION = {
  afterOrganizationMutation: [queryKeys.admin.analytics.all],
  afterInvoiceMutation: [queryKeys.admin.analytics.all],
  afterSubscriptionMutation: [
    queryKeys.admin.analytics.subscriptions,
    queryKeys.admin.analytics.summary,
  ],
} as const

export async function invalidateAnalyticsAfterOrganizationMutation(queryClient: QueryClient) {
  await Promise.all(
    ANALYTICS_INVALIDATION.afterOrganizationMutation.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  )
}

export async function invalidateAnalyticsAfterInvoiceMutation(queryClient: QueryClient) {
  await Promise.all(
    ANALYTICS_INVALIDATION.afterInvoiceMutation.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  )
}

export async function invalidateAnalyticsAfterSubscriptionMutation(queryClient: QueryClient) {
  await Promise.all(
    ANALYTICS_INVALIDATION.afterSubscriptionMutation.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  )
}
