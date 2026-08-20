'use client'

import { useEffect, useState } from 'react'
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
import {
  fetchAllOrganizations,
  fetchAllSubscriptions,
  fetchInvoiceSummary,
  countTrialOrganizations,
} from '../analytics/super-admin-analytics'
import type { SuperAdminOrganization, SuperAdminSubscription, SuperAdminInvoiceSummary } from '@/lib/api'

type KpiData = {
  organizations: SuperAdminOrganization[]
  totalOrgs: number
  subscriptions: SuperAdminSubscription[]
  invoiceSummary: SuperAdminInvoiceSummary | null
}

export function AdminKpiGrid() {
  const t = useTranslations('admin.home.kpis')
  const tAnalytics = useTranslations('admin.analytics')
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [orgResult, subscriptions, invoiceSummary] = await Promise.all([
          fetchAllOrganizations(),
          fetchAllSubscriptions(),
          fetchInvoiceSummary(),
        ])
        if (!cancelled) {
          setData({
            organizations: orgResult.items,
            totalOrgs: orgResult.total,
            subscriptions,
            invoiceSummary,
          })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : tAnalytics('unavailable'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tAnalytics])

  if (loading) {
    return (
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <KPIStatCardSkeleton key={i} className="h-full" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <div className="col-span-full rounded-2xl border border-dash-border bg-dash-surface p-6 text-center text-sm text-mute">
          {error ?? tAnalytics('unavailable')}
        </div>
      </div>
    )
  }

  const activeOrgs = data.organizations.filter((o) => o.deletedAt == null && o.status === true)
  const suspendedOrgs = data.organizations.filter(
    (o) => o.deletedAt == null && o.status === false
  )
  const trialCount = countTrialOrganizations(data.subscriptions)

  const items = [
    {
      key: 'totalOrganizations' as const,
      icon: Building2,
      value: data.totalOrgs,
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
      value: data.invoiceSummary?.thisMonthAmount ?? 0,
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
