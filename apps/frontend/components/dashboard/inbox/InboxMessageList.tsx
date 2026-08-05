'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Mail } from 'lucide-react'
import type { InboxMessage } from '@/lib/api'
import { InboxMessageBubble } from './InboxMessageBubble'
import { InboxThreadMessagesSkeleton } from './InboxThreadSkeleton'

type InboxMessageListProps = {
  messages: InboxMessage[]
  contactName: string
  loading?: boolean
}

export function InboxMessageList({ messages, contactName, loading }: InboxMessageListProps) {
  const t = useTranslations('dashboard.inbox.thread')
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (loading || messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [loading, messages])

  if (loading) {
    return <InboxThreadMessagesSkeleton />
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-dash-surface text-lg">
          <Mail className="size-5 text-mute" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
        <p className="max-w-sm text-sm leading-5 text-mute">{t('emptyDescription')}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
    >
      {messages.map((message) => (
        <InboxMessageBubble key={message.id} message={message} contactName={contactName} />
      ))}
      <div ref={bottomRef} aria-hidden className="h-px shrink-0" />
    </div>
  )
}
