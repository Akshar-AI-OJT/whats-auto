'use client'

import { useTranslations } from 'next-intl'
import { MOCK_ACTIVITY } from '../mock-data'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { ActivityItem } from './ActivityItem'

export function RecentActivity() {
  const t = useTranslations('dashboard.home.activity')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <ol className="mt-6 flex flex-1 flex-col">
        {MOCK_ACTIVITY.map((item, index) => (
          <li key={item.id}>
            <ActivityItem
              id={item.id}
              title={item.title}
              detail={item.detail}
              timestamp={item.timestamp}
              type={item.type}
              tone={item.tone}
              isLast={index === MOCK_ACTIVITY.length - 1}
            />
          </li>
        ))}
      </ol>
    </DashboardPanel>
  )
}
