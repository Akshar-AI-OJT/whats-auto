'use client'

import { useTranslations } from 'next-intl'
import type { InboxConversation } from '@/lib/api'
import { conversationAiMode, handoverBannerKind } from './inbox-ai-mode'

type InboxAiHandoverBannerProps = {
  conversation: Pick<
    InboxConversation,
    'aiMode' | 'aiHandoverReason' | 'automationBlocked' | 'openFlowSessionStatus'
  >
}

export function InboxAiHandoverBanner({ conversation }: InboxAiHandoverBannerProps) {
  const t = useTranslations('dashboard.inbox.aiMode')
  const mode = conversationAiMode(conversation)
  const orphanPause =
    mode === 'AI_AUTO' &&
    (conversation.automationBlocked === true ||
      conversation.openFlowSessionStatus === 'PAUSED_FOR_HUMAN')

  if (mode === 'HUMAN_ACTIVE') {
    return (
      <div
        role="status"
        className="border-b border-dash-border bg-dash-surface/80 px-4 py-2.5 sm:px-5"
      >
        <p className="text-sm font-medium text-ink">{t('banner.humanTitle')}</p>
        <p className="mt-0.5 text-xs leading-5 text-body">{t('banner.humanBody')}</p>
      </div>
    )
  }

  if (orphanPause) {
    return (
      <div
        role="status"
        className="border-b border-dash-border bg-dash-surface/80 px-4 py-2.5 sm:px-5"
      >
        <p className="text-sm font-medium text-ink">{t('banner.orphanTitle')}</p>
        <p className="mt-0.5 text-xs leading-5 text-body">{t('banner.orphanBody')}</p>
      </div>
    )
  }

  if (mode !== 'HANDOVER') return null

  const kind = handoverBannerKind(conversation.aiHandoverReason)
  const keyword =
    kind === 'keyword' &&
    conversation.aiHandoverReason &&
    conversation.aiHandoverReason !== 'keyword_match'
      ? conversation.aiHandoverReason
      : null

  return (
    <div
      role="status"
      className="border-b border-dash-border bg-dash-surface/80 px-4 py-2.5 sm:px-5"
    >
      <p className="text-sm font-medium text-ink">{t('banner.title')}</p>
      <p className="mt-0.5 text-xs leading-5 text-body">
        {kind === 'keyword'
          ? keyword
            ? t('banner.keyword', { keyword })
            : t('banner.keywordGeneric')
          : t(`banner.${kind}`)}
      </p>
    </div>
  )
}
