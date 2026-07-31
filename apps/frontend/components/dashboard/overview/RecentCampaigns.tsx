'use client'

import { Megaphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { DashboardEmptyState } from './DashboardEmptyState'

export function RecentCampaigns() {
  const t = useTranslations('dashboard.home')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('campaigns.title')}
        description={t('campaigns.description')}
      />

      <DashboardEmptyState
        icon={<Megaphone className="size-5" aria-hidden />}
        title={t('campaigns.emptyTitle')}
        description={t('campaigns.emptyDescription')}
      />
    </DashboardPanel>
  )
}
