'use client'

import { useTranslations } from 'next-intl'
import type { InboxMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatMessageTime, isCustomerMessage, messageBodyText } from './inbox-utils'

type InboxMessageBubbleProps = {
  message: InboxMessage
  contactName: string
}

export function InboxMessageBubble({ message, contactName }: InboxMessageBubbleProps) {
  const t = useTranslations('dashboard.inbox.thread')
  const isCustomer = isCustomerMessage(message)
  const body = messageBodyText(message)

  const senderName = isCustomer
    ? message.sender.name?.trim() || contactName
    : message.sender.name?.trim() || t('agentSender')

  return (
    <div
      className={cn('flex w-full', isCustomer ? 'justify-start' : 'justify-end')}
      data-message-id={message.id}
    >
      <div
        className={cn(
          'max-w-[min(85%,28rem)] rounded-2xl px-3.5 py-2.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]',
          isCustomer
            ? 'rounded-tl-md border border-dash-border bg-dash-surface text-ink'
            : 'rounded-tr-md bg-primary text-on-primary'
        )}
      >
        <p
          className={cn(
            'text-[11px] font-semibold tracking-wide uppercase',
            isCustomer ? 'text-mute' : 'text-on-primary/80'
          )}
        >
          {senderName}
        </p>
        <p className="mt-1 text-sm leading-5 break-words whitespace-pre-wrap">
          {body || t('noContent')}
        </p>
        <p
          className={cn(
            'mt-1.5 text-[11px] tabular-nums',
            isCustomer ? 'text-mute' : 'text-on-primary/75'
          )}
        >
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
