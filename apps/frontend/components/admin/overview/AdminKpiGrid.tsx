'use client'

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
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { MOCK_ADMIN_KPIS } from '../mock-data'

export function AdminKpiGrid() {
  const t = useTranslations('admin.home.kpis')

  const items = [
    {
      key: 'totalOrganizations' as const,
      icon: Building2,
      value: MOCK_ADMIN_KPIS.totalOrganizations.value,
      delta: MOCK_ADMIN_KPIS.totalOrganizations.delta,
      trend: MOCK_ADMIN_KPIS.totalOrganizations.tone,
    },
    {
      key: 'activeOrganizations' as const,
      icon: Building,
      value: MOCK_ADMIN_KPIS.activeOrganizations.value,
      delta: MOCK_ADMIN_KPIS.activeOrganizations.delta,
      trend: MOCK_ADMIN_KPIS.activeOrganizations.tone,
    },
    {
      key: 'trialOrganizations' as const,
      icon: Sparkles,
      value: MOCK_ADMIN_KPIS.trialOrganizations.value,
      delta: MOCK_ADMIN_KPIS.trialOrganizations.delta,
      trend: MOCK_ADMIN_KPIS.trialOrganizations.tone,
    },
    {
      key: 'suspendedOrganizations' as const,
      icon: PauseCircle,
      value: MOCK_ADMIN_KPIS.suspendedOrganizations.value,
      delta: MOCK_ADMIN_KPIS.suspendedOrganizations.delta,
      trend: MOCK_ADMIN_KPIS.suspendedOrganizations.tone,
    },
    {
      key: 'totalPlatformUsers' as const,
      icon: Users,
      value: MOCK_ADMIN_KPIS.totalPlatformUsers.value,
      delta: MOCK_ADMIN_KPIS.totalPlatformUsers.delta,
      trend: MOCK_ADMIN_KPIS.totalPlatformUsers.tone,
    },
    {
      key: 'monthlyRevenue' as const,
      icon: CreditCard,
      value: MOCK_ADMIN_KPIS.monthlyRevenue.value,
      delta: MOCK_ADMIN_KPIS.monthlyRevenue.delta,
      trend: MOCK_ADMIN_KPIS.monthlyRevenue.tone,
      prefix: MOCK_ADMIN_KPIS.monthlyRevenue.prefix,
    },
    {
      key: 'activeWhatsappNumbers' as const,
      icon: Phone,
      value: MOCK_ADMIN_KPIS.activeWhatsappNumbers.value,
      delta: MOCK_ADMIN_KPIS.activeWhatsappNumbers.delta,
      trend: MOCK_ADMIN_KPIS.activeWhatsappNumbers.tone,
    },
    {
      key: 'pendingSupportTickets' as const,
      icon: Headset,
      value: MOCK_ADMIN_KPIS.pendingSupportTickets.value,
      delta: MOCK_ADMIN_KPIS.pendingSupportTickets.delta,
      trend: MOCK_ADMIN_KPIS.pendingSupportTickets.tone,
    },
  ]

  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
      {items.map((item) => (
        <KPIStatCard
          key={item.key}
          label={t(`${item.key}.label`)}
          value={item.value}
          prefix={'prefix' in item ? item.prefix : undefined}
          delta={item.delta}
          trend={item.trend}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          className="h-full"
        />
      ))}
    </div>
  )
}
