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
import { useLocale, useTranslations } from 'next-intl'
import { KPIStatCard, KPIStatCardSkeleton } from '@/components/dashboard/overview/KPIStatCard'
import { queryKeys } from '@/lib/query-keys'
import {
  fetchAllOrganizations,
  fetchAllSubscriptions,
  fetchCurrentMonthPaidRevenue,
  fetchPlatformUserTotal,
  countOrganizationsByUiStatus,
  countTrialOrganizations,
  formatCurrency,
} from '../analytics/super-admin-analytics'

const STALE_MS = 60_000

export function AdminKpiGrid() {
  const locale = useLocale()
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
  const monthlyRevenueQuery = useQuery({
    queryKey: queryKeys.admin.analytics.currentMonthPaidRevenue,
    queryFn: fetchCurrentMonthPaidRevenue,
    staleTime: STALE_MS,
  })
  const platformUsersQuery = useQuery({
    queryKey: queryKeys.admin.analytics.platformUsersTotal,
    queryFn: fetchPlatformUserTotal,
    staleTime: STALE_MS,
  })

  const loading =
    orgQuery.isLoading ||
    subscriptionsQuery.isLoading ||
    monthlyRevenueQuery.isLoading ||
    platformUsersQuery.isLoading
  const error =
    orgQuery.error ??
    subscriptionsQuery.error ??
    monthlyRevenueQuery.error ??
    platformUsersQuery.error ??
    null

  const organizations = useMemo(() => orgQuery.data?.items ?? [], [orgQuery.data?.items])
  const subscriptions = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data])
  const orgCounts = useMemo(
    () => countOrganizationsByUiStatus(organizations),
    [organizations]
  )
  const totalOrgs = orgQuery.data?.total ?? organizations.length
  const trialCount = countTrialOrganizations(subscriptions)
  const monthlyRevenue = monthlyRevenueQuery.data ?? 0
  const platformUserTotal = platformUsersQuery.data ?? null

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

  const items = [
    {
      key: 'totalOrganizations' as const,
      icon: Building2,
      value: totalOrgs,
      trend: 'neutral' as const,
      href: '/admin/organizations',
    },
    {
      key: 'activeOrganizations' as const,
      icon: Building,
      value: orgCounts.active,
      trend: 'neutral' as const,
      href: '/admin/organizations',
    },
    {
      key: 'trialOrganizations' as const,
      icon: Sparkles,
      value: trialCount,
      trend: 'neutral' as const,
      href: '/admin/subscriptions',
    },
    {
      key: 'suspendedOrganizations' as const,
      icon: PauseCircle,
      value: orgCounts.suspended,
      trend: 'neutral' as const,
      href: '/admin/organizations',
    },
    {
      key: 'totalPlatformUsers' as const,
      icon: Users,
      value: platformUserTotal ?? '—',
      format: platformUserTotal == null ? ('plain' as const) : undefined,
      trend: 'neutral' as const,
      href: '/admin/platform-users',
    },
    {
      key: 'monthlyRevenue' as const,
      icon: CreditCard,
      value: formatCurrency(monthlyRevenue, locale),
      format: 'plain' as const,
      trend: 'neutral' as const,
      href: '/admin/invoices',
    },
    {
      key: 'activeWhatsappNumbers' as const,
      icon: Phone,
      value: '—' as string,
      format: 'plain' as const,
      trend: 'neutral' as const,
      href: '/admin/analytics',
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
          trend={item.trend}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          href={'href' in item ? item.href : undefined}
          className="h-full"
        />
      ))}
    </div>
  )
}
