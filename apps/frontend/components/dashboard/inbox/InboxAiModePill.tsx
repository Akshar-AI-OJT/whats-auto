'use client'

import { useTranslations } from 'next-intl'
import type { InboxConversation } from '@/lib/api'
import { cn } from '@/lib/utils'
import { conversationAiMode } from './inbox-ai-mode'

type InboxAiModePillProps = {
  conversation: Pick<InboxConversation, 'aiMode'>
  size?: 'sm' | 'md'
}

export function InboxAiModePill({ conversation, size = 'md' }: InboxAiModePillProps) {
  const t = useTranslations('dashboard.inbox.aiMode')
  const mode = conversationAiMode(conversation)

  const tone =
    mode === 'AI_AUTO'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : mode === 'HANDOVER'
        ? 'bg-dash-surface text-ink ring-dash-border-strong'
        : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span
      className={cn(
        'inline-flex font-semibold ring-1',
        size === 'sm' ? 'rounded-md px-1.5 py-0.5 text-[10px]' : 'rounded-md px-2 py-0.5 text-xs',
        tone
      )}
    >
      {t(`pill.${mode}`)}
    </span>
  )
}
