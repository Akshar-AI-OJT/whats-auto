'use client'

import { ArrowRight, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { useDashboardOverview } from './DashboardOverviewProvider'
import { useProductAccess } from '@/hooks/useProductAccess'
import { resolveDashboardHref } from '@/lib/product-access'
import { PanelError, PanelLoading } from './DashboardSectionState'
import { DashboardEmptyState } from './DashboardEmptyState'
import { ConversationRow } from './ConversationRow'
import {
  conversationDisplayName,
  mapConversationStatus,
} from './dashboard-overview-data'

export function RecentConversations() {
  const t = useTranslations('dashboard.home')
  const tInbox = useTranslations('dashboard.inbox')
  const router = useRouter()
  const {
    conversations,
    conversationsLoading,
    conversationsError,
    refetchConversations,
    orgsLoading,
  } = useDashboardOverview()
  const { hasFullProductAccess, isSetupComplete } = useProductAccess()

  const loading = conversationsLoading || orgsLoading

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('conversations.title')}
        description={t('conversations.description')}
        action={
          <Link
            href={resolveDashboardHref('/dashboard/inbox', { hasFullProductAccess, isSetupComplete })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-positive-deep',
              'transition-[background-color,color] duration-200 hover:bg-primary-pale'
            )}
          >
            {t('conversations.viewAll')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      {loading ? (
        <PanelLoading label={t('loading.conversations')} />
      ) : conversationsError ? (
        <PanelError
          label={t('errors.conversations')}
          retryLabel={t('retry')}
          retry={refetchConversations}
        />
      ) : conversations.length === 0 ? (
        <DashboardEmptyState
          icon={<MessageCircle className="size-5" aria-hidden />}
          title={t('conversations.emptyTitle')}
          description={t('conversations.emptyDescription')}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          {conversations.map((conversation) => {
            const uiStatus = mapConversationStatus(String(conversation.status))
            const statusKey =
              uiStatus === 'waiting' ? 'waiting' : uiStatus === 'resolved' ? 'resolved' : 'open'

            return (
              <ConversationRow
                key={conversation.id}
                id={conversation.id}
                name={conversationDisplayName(conversation)}
                preview={conversation.lastMessageText?.trim() || tInbox('noPreview')}
                timestamp={
                  conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt
                }
                unread={conversation.unreadCount}
                status={uiStatus}
                statusLabel={t(`conversations.status.${statusKey}`)}
                onClick={() => router.push(`/dashboard/inbox/${conversation.id}`)}
              />
            )
          })}
        </div>
      )}
    </DashboardPanel>
  )
}
