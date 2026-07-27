'use client'

import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { MOCK_CONVERSATIONS } from '../mock-data'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { ConversationRow } from './ConversationRow'

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
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-positive-deep',
              'transition-[background-color,color,transform] duration-200',
              'hover:bg-primary-pale hover:translate-x-0.5'
            )}
          >
            {t('conversations.viewAll')}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        }
      />

      <ul className="mt-5 flex flex-1 flex-col gap-1.5">
        {MOCK_CONVERSATIONS.map((item) => (
          <li key={item.id}>
            <ConversationRow
              id={item.id}
              name={item.name}
              preview={item.preview}
              timestamp={item.timestamp}
              unread={item.unread}
              status={item.status}
              presence={item.presence}
              statusLabel={t(`conversations.status.${item.status}`)}
            />
          </li>
        ))}
      </ul>
    </DashboardPanel>
  )
}
