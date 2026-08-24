'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Building,
  CreditCard,
  Headset,
  PauseCircle,
  Phone,
  Sparkles,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { KPIStatCard, KPIStatCardSkeleton } from '@/components/dashboard/overview/KPIStatCard'
import { queryKeys } from '@/lib/query-keys'
import {
  fetchAllOrganizations,
  fetchAllSubscriptions,
  fetchInvoiceSummary,
  countTrialOrganizations,
} from '../analytics/super-admin-analytics'

const STALE_MS = 60_000

export function AdminKpiGrid() {
  const t = useTranslations('admin.home.kpis')
  const tAnalytics = useTranslations('admin.analytics')

  const orgQuery = useQuery({
    queryKey: queryKeys.admin.analytics.organizations,
    queryFn: fetchAllOrganizations,
    staleTime: STALE_MS,
  })
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.admin.analytics.subscriptions,
    queryFn: fetchAllSubscriptions,
    staleTime: STALE_MS,
  })
  const invoiceSummaryQuery = useQuery({
    queryKey: queryKeys.admin.analytics.invoiceSummary,
    queryFn: fetchInvoiceSummary,
    staleTime: STALE_MS,
  })

  const loading =
    orgQuery.isLoading || subscriptionsQuery.isLoading || invoiceSummaryQuery.isLoading
  const error = orgQuery.error ?? subscriptionsQuery.error ?? invoiceSummaryQuery.error ?? null

  const organizations = useMemo(() => orgQuery.data?.items ?? [], [orgQuery.data?.items])
  const totalOrgs = orgQuery.data?.total ?? organizations.length
  const subscriptions = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data])
  const invoiceSummary = invoiceSummaryQuery.data ?? null

  if (loading) {
    return (
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <KPIStatCardSkeleton key={i} className="h-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <div className="col-span-full rounded-2xl border border-dash-border bg-dash-surface p-6 text-center text-sm text-mute">
          {error instanceof Error ? error.message : tAnalytics('unavailable')}
        </div>
      </div>
    )
  }

  const activeOrgs = organizations.filter((o) => o.deletedAt == null && o.status === true)
  const suspendedOrgs = organizations.filter((o) => o.deletedAt == null && o.status === false)
  const trialCount = countTrialOrganizations(subscriptions)

  const items = [
    {
      key: 'totalOrganizations' as const,
      icon: Building2,
      value: totalOrgs,
      trend: 'neutral' as const,
    },
    {
      key: 'activeOrganizations' as const,
      icon: Building,
      value: activeOrgs.length,
      trend: 'neutral' as const,
    },
    {
      key: 'trialOrganizations' as const,
      icon: Sparkles,
      value: trialCount,
      trend: 'neutral' as const,
    },
    {
      key: 'suspendedOrganizations' as const,
      icon: PauseCircle,
      value: suspendedOrgs.length,
      trend: 'neutral' as const,
    },
    {
      key: 'totalPlatformUsers' as const,
      icon: Users,
      value: '—' as string,
      format: 'plain' as const,
      trend: 'neutral' as const,
    },
    {
      key: 'monthlyRevenue' as const,
      icon: CreditCard,
      value: invoiceSummary?.thisMonthAmount ?? 0,
      prefix: '$',
      trend: 'neutral' as const,
    },
    {
      key: 'activeWhatsappNumbers' as const,
      icon: Phone,
      value: '—' as string,
      format: 'plain' as const,
      trend: 'neutral' as const,
    },
    {
      key: 'pendingSupportTickets' as const,
      icon: Headset,
      value: '—' as string,
      format: 'plain' as const,
      trend: 'neutral' as const,
    },
  ]

  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
      {items.map((item) => (
        <KPIStatCard
          key={item.key}
          label={t(`${item.key}.label`)}
          value={item.value}
          format={'format' in item ? item.format : undefined}
          prefix={'prefix' in item ? item.prefix : undefined}
          trend={item.trend}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          className="h-full"
        />
      ))}
    </div>
  )
}
