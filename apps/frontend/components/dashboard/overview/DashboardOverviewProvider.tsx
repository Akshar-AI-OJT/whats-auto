'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AuthorizationAuditEvent, Campaign, InboxConversation } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { queryKeys } from '@/lib/query-keys'
import {
  buildAuditActivityItems,
  fetchOverviewAudit,
  fetchOverviewCampaigns,
  fetchOverviewConversations,
  fetchOverviewKpis,
  type DashboardAuditActivityItem,
  type DashboardOverviewKpis,
} from './dashboard-overview-data'

type DashboardOverviewContextValue = {
  organizationId: string | null
  orgsLoading: boolean
  kpis: DashboardOverviewKpis
  kpisLoading: boolean
  kpisError: boolean
  refetchKpis: () => void
  conversations: InboxConversation[]
  conversationsTotal: number
  conversationsLoading: boolean
  conversationsError: boolean
  refetchConversations: () => void
  campaigns: Campaign[]
  campaignsLoading: boolean
  campaignsError: boolean
  refetchCampaigns: () => void
  auditEvents: AuthorizationAuditEvent[]
  auditItems: DashboardAuditActivityItem[]
  auditLoading: boolean
  auditError: boolean
  refetchAudit: () => void
}

const DashboardOverviewContext = createContext<DashboardOverviewContextValue | null>(null)

const EMPTY_KPIS: DashboardOverviewKpis = {
  contactsCount: 0,
  conversationsCount: 0,
  campaignsCount: 0,
  deliveryRate: 0,
}

export function DashboardOverviewProvider({
  children,
  noDetailsLabel,
}: {
  children: ReactNode
  noDetailsLabel: string
}) {
  const {
    tenantOrganizationId,
    isLoading: orgsLoading,
    hasFullProductAccess,
    isResolvingAccess,
  } = useOrganizations()

  const gateLoading = orgsLoading || isResolvingAccess || !tenantOrganizationId
  const enabled = Boolean(tenantOrganizationId) && hasFullProductAccess && !isResolvingAccess

  const kpisQuery = useQuery({
    queryKey: queryKeys.overview.contacts(tenantOrganizationId),
    enabled,
    queryFn: fetchOverviewKpis,
  })

  const conversationsQuery = useQuery({
    queryKey: queryKeys.overview.conversations(tenantOrganizationId),
    enabled,
    queryFn: fetchOverviewConversations,
  })

  const campaignsQuery = useQuery({
    queryKey: queryKeys.overview.campaigns(tenantOrganizationId),
    enabled,
    queryFn: fetchOverviewCampaigns,
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.overview.audit(tenantOrganizationId),
    enabled,
    queryFn: fetchOverviewAudit,
  })

  const kpis = kpisQuery.data ?? EMPTY_KPIS

  const auditItems = useMemo(
    () => buildAuditActivityItems(auditQuery.data ?? [], noDetailsLabel),
    [auditQuery.data, noDetailsLabel]
  )

  // Use isLoading (pending && fetching), not isPending — disabled queries stay
  // isPending forever and were causing endless "Loading…" after the shell rendered.
  const kpisLoading = gateLoading || (enabled && kpisQuery.isLoading)
  const conversationsLoading = gateLoading || (enabled && conversationsQuery.isLoading)
  const campaignsLoading = gateLoading || (enabled && campaignsQuery.isLoading)
  const auditLoading = gateLoading || (enabled && auditQuery.isLoading)

  const refetchKpis = useCallback(() => {
    void kpisQuery.refetch()
  }, [kpisQuery])

  const refetchConversations = useCallback(() => {
    void conversationsQuery.refetch()
  }, [conversationsQuery])

  const refetchCampaigns = useCallback(() => {
    void campaignsQuery.refetch()
  }, [campaignsQuery])

  const refetchAudit = useCallback(() => {
    void auditQuery.refetch()
  }, [auditQuery])

  const value = useMemo<DashboardOverviewContextValue>(
    () => ({
      organizationId: tenantOrganizationId,
      orgsLoading,
      kpis,
      kpisLoading,
      kpisError: kpisQuery.isError,
      refetchKpis,
      conversations: conversationsQuery.data?.items ?? [],
      conversationsTotal:
        conversationsQuery.data?.total ?? kpis.conversationsCount,
      conversationsLoading,
      conversationsError: conversationsQuery.isError,
      refetchConversations,
      campaigns: campaignsQuery.data ?? [],
      campaignsLoading,
      campaignsError: campaignsQuery.isError,
      refetchCampaigns,
      auditEvents: auditQuery.data ?? [],
      auditItems,
      auditLoading,
      auditError: auditQuery.isError,
      refetchAudit,
    }),
    [
      tenantOrganizationId,
      orgsLoading,
      kpis,
      kpisLoading,
      kpisQuery.isError,
      refetchKpis,
      conversationsQuery.data?.items,
      conversationsQuery.data?.total,
      conversationsLoading,
      conversationsQuery.isError,
      refetchConversations,
      campaignsQuery.data,
      campaignsLoading,
      campaignsQuery.isError,
      refetchCampaigns,
      auditQuery.data,
      auditItems,
      auditLoading,
      auditQuery.isError,
      refetchAudit,
    ]
  )

  return (
    <DashboardOverviewContext.Provider value={value}>
      {children}
    </DashboardOverviewContext.Provider>
  )
}

export function useDashboardOverview() {
  const context = useContext(DashboardOverviewContext)
  if (!context) {
    throw new Error('useDashboardOverview must be used within DashboardOverviewProvider')
  }
  return context
}
