'use client'

import { Megaphone, MessageCircle, Send, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDashboardOverview } from './DashboardOverviewProvider'
import { KPIStatCard } from './KPIStatCard'

export function KpiGrid() {
  const t = useTranslations('dashboard.home.kpis')
  const { kpis, kpisLoading, orgsLoading } = useDashboardOverview()

  const loading = kpisLoading || orgsLoading

  const items = [
    {
      key: 'contacts' as const,
      icon: Users,
      value: kpis.contactsCount,
      format: 'number' as const,
      href: '/dashboard/contacts',
    },
    {
      key: 'conversations' as const,
      icon: MessageCircle,
      value: kpis.conversationsCount,
      format: 'number' as const,
      href: '/dashboard/inbox',
    },
    {
      key: 'campaigns' as const,
      icon: Megaphone,
      value: kpis.campaignsCount,
      format: 'number' as const,
      href: '/dashboard/campaigns',
    },
    {
      key: 'delivery' as const,
      icon: Send,
      value: kpis.deliveryRate,
      format: 'percent' as const,
      suffix: '%',
      href: '/dashboard/analytics',
    },
  ]

  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
      {items.map((item) => (
        <KPIStatCard
          key={item.key}
          label={t(`${item.key}.label`)}
          value={item.value}
          format={item.format}
          suffix={'suffix' in item ? item.suffix : undefined}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          href={item.href}
          loading={loading}
          className="h-full"
        />
      ))}
    </div>
  )
}
