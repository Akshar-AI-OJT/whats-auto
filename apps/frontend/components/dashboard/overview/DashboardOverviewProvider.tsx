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
  fetchOverviewContacts,
  fetchOverviewConversations,
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

export function DashboardOverviewProvider({
  children,
  noDetailsLabel,
}: {
  children: ReactNode
  noDetailsLabel: string
}) {
  const { tenantOrganizationId, isLoading: orgsLoading } = useOrganizations()
  const enabled = Boolean(tenantOrganizationId) && !orgsLoading

  const contactsQuery = useQuery({
    queryKey: queryKeys.overview.contacts(tenantOrganizationId),
    enabled,
    queryFn: () => fetchOverviewContacts(tenantOrganizationId!),
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

  const kpis = useMemo<DashboardOverviewKpis>(
    () => ({
      contactsCount: contactsQuery.data ?? 0,
      conversationsCount: conversationsQuery.data?.total ?? 0,
      campaignsCount: campaignsQuery.data?.kpis.campaignsCount ?? 0,
      deliveryRate: campaignsQuery.data?.kpis.deliveryRate ?? 0,
    }),
    [contactsQuery.data, conversationsQuery.data?.total, campaignsQuery.data?.kpis]
  )

  const auditItems = useMemo(
    () => buildAuditActivityItems(auditQuery.data ?? [], noDetailsLabel),
    [auditQuery.data, noDetailsLabel]
  )

  const kpisLoading =
    orgsLoading ||
    contactsQuery.isLoading ||
    conversationsQuery.isLoading ||
    campaignsQuery.isLoading

  const kpisError =
    contactsQuery.isError || conversationsQuery.isError || campaignsQuery.isError

  const refetchKpis = useCallback(() => {
    void contactsQuery.refetch()
    void conversationsQuery.refetch()
    void campaignsQuery.refetch()
  }, [contactsQuery, conversationsQuery, campaignsQuery])

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
      kpisError,
      refetchKpis,
      conversations: conversationsQuery.data?.items ?? [],
      conversationsTotal: conversationsQuery.data?.total ?? 0,
      conversationsLoading: orgsLoading || conversationsQuery.isLoading,
      conversationsError: conversationsQuery.isError,
      refetchConversations,
      campaigns: campaignsQuery.data?.recent ?? [],
      campaignsLoading: orgsLoading || campaignsQuery.isLoading,
      campaignsError: campaignsQuery.isError,
      refetchCampaigns,
      auditEvents: auditQuery.data ?? [],
      auditItems,
      auditLoading: orgsLoading || auditQuery.isLoading,
      auditError: auditQuery.isError,
      refetchAudit,
    }),
    [
      tenantOrganizationId,
      orgsLoading,
      kpis,
      kpisLoading,
      kpisError,
      refetchKpis,
      conversationsQuery.data?.items,
      conversationsQuery.data?.total,
      conversationsQuery.isLoading,
      conversationsQuery.isError,
      refetchConversations,
      campaignsQuery.data?.recent,
      campaignsQuery.isLoading,
      campaignsQuery.isError,
      refetchCampaigns,
      auditQuery.data,
      auditItems,
      auditQuery.isLoading,
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
