'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type BillingEntitlementsSnapshot } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'

async function fetchEntitlements(): Promise<BillingEntitlementsSnapshot> {
  const { data } = await api.billing.entitlements()
  return (data?.data ?? data) as BillingEntitlementsSnapshot
}

export function useEntitlements() {
  const { tenantOrganizationId, isLoading: orgsLoading } = useOrganizations()

  const query = useQuery({
    queryKey: queryKeys.billing.entitlements(tenantOrganizationId),
    queryFn: fetchEntitlements,
    enabled: Boolean(tenantOrganizationId) && !orgsLoading,
    staleTime: 60_000,
  })

  const features = query.data?.features ?? []
  const hasFeature = (key: string) => features.find((f) => f.key === key)?.enabled === true

  return {
    ...query,
    hasFeature,
    limits: query.data?.limits ?? null,
    usage: query.data?.usage ?? null,
  }
}
