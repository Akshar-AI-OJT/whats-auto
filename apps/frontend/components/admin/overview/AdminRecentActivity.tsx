'use client'

import {
  Building2,
  CreditCard,
  Headset,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ActivityItem } from '@/components/dashboard/overview/ActivityItem'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  MOCK_ADMIN_ACTIVITY,
  type AdminActivityKind,
} from '../mock-data'

const KIND_ICONS: Record<AdminActivityKind, LucideIcon> = {
  organization: Building2,
  subscription: CreditCard,
  user: UserPlus,
  support: Headset,
  billing: Wallet,
}

export function AdminRecentActivity() {
  const t = useTranslations('admin.home.activity')
  const translatedItems = useMemo(
    () =>
      MOCK_ADMIN_ACTIVITY.map((item) => ({
        ...item,
        title: t(`items.${item.titleKey}`),
        detail: t(`items.${item.detailKey}`),
      })),
    [t]
  )

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <ol className="mt-6 flex flex-1 flex-col">
        {translatedItems.map((item, index) => (
          <li key={item.id}>
            <ActivityItem
              id={item.id}
              title={item.title}
              detail={item.detail}
              timestamp={item.timestamp}
              tone={item.tone}
              icon={KIND_ICONS[item.kind]}
              isLast={index === translatedItems.length - 1}
            />
          </li>
        ))}
      </ol>
    </DashboardPanel>
  )
}
