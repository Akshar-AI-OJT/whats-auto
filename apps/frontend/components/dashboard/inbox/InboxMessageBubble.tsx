'use client'

import { useTranslations } from 'next-intl'
import { FileText, ExternalLink } from 'lucide-react'
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
  const contentType = message.contentType?.toLowerCase() ?? 'text'
  const mediaUrl = message.mediaUrl?.trim() || null

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

        {contentType === 'image' && mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl}
              alt={body || t('imageAlt')}
              className="max-h-56 w-full object-cover"
            />
          </a>
        ) : null}

        {(contentType === 'document' || contentType === 'file') && mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'mt-2 inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium',
              isCustomer
                ? 'bg-canvas text-ink ring-1 ring-dash-border'
                : 'bg-on-primary/15 text-on-primary'
            )}
          >
            <FileText className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{body || t('documentLabel')}</span>
            <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </a>
        ) : null}

        {body && !(contentType === 'document' && mediaUrl) ? (
          <p className="mt-1 text-sm leading-5 break-words whitespace-pre-wrap">
            {body}
          </p>
        ) : !mediaUrl ? (
          <p className="mt-1 text-sm leading-5 break-words whitespace-pre-wrap">
            {t('noContent')}
          </p>
        ) : null}

        {message.errorMessage ? (
          <p
            className={cn(
              'mt-1.5 text-[11px]',
              isCustomer ? 'text-negative' : 'text-on-primary/90'
            )}
          >
            {message.errorMessage}
          </p>
        ) : null}

        <p
          className={cn(
            'mt-1.5 text-[11px] tabular-nums',
            isCustomer ? 'text-mute' : 'text-on-primary/75'
          )}
        >
          {formatMessageTime(message.createdAt)}
          {message.status ? ` · ${message.status}` : null}
        </p>
      </div>
    </div>
  )
}
