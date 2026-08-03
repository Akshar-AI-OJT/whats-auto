'use client'

import { Activity } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { DashboardEmptyState } from './DashboardEmptyState'

export function RecentActivity() {
  const t = useTranslations('dashboard.home.activity')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <DashboardEmptyState
        icon={<Activity className="size-5" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    </DashboardPanel>
  )
}
