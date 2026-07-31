'use client'

import { ArrowRight, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { DashboardEmptyState } from './DashboardEmptyState'

export function RecentConversations() {
  const t = useTranslations('dashboard.home')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('conversations.title')}
        description={t('conversations.description')}
        action={
          <button
            type="button"
            disabled
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-mute',
              'cursor-not-allowed opacity-70'
            )}
          >
            {t('conversations.viewAll')}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        }
      />

      <DashboardEmptyState
        icon={<MessageCircle className="size-5" aria-hidden />}
        title={t('conversations.emptyTitle')}
        description={t('conversations.emptyDescription')}
      />
    </DashboardPanel>
  )
}
