'use client'

import { Activity } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { useDashboardOverview } from './DashboardOverviewProvider'
import { PanelError, PanelLoading } from './DashboardSectionState'
import { DashboardEmptyState } from './DashboardEmptyState'
import { ActivityItem } from './ActivityItem'

export function RecentActivity() {
  const t = useTranslations('dashboard.home.activity')
  const tHome = useTranslations('dashboard.home')
  const { auditItems, auditLoading, auditError, refetchAudit, orgsLoading } =
    useDashboardOverview()

  const loading = auditLoading || orgsLoading

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      {loading ? (
        <PanelLoading label={tHome('loading.activity')} />
      ) : auditError ? (
        <PanelError
          label={tHome('errors.activity')}
          retryLabel={tHome('retry')}
          retry={refetchAudit}
        />
      ) : auditItems.length === 0 ? (
        <DashboardEmptyState
          icon={<Activity className="size-5" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="mt-4 flex flex-col">
          {auditItems.map((item, index) => (
            <ActivityItem
              key={item.id}
              id={item.id}
              title={item.title}
              detail={item.detail}
              timestamp={item.timestamp}
              tone={item.tone}
              isLast={index === auditItems.length - 1}
            />
          ))}
        </div>
      )}
    </DashboardPanel>
  )
}
