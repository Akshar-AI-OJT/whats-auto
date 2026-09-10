'use client'

import { useTranslations } from 'next-intl'
import { FileText, ExternalLink } from 'lucide-react'
import type { InboxMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatMessageTime, isCustomerMessage, messageBodyText } from './inbox-utils'

type InboxMessageBubbleProps = {
  message: InboxMessage
  isGroupStart?: boolean
  isGroupEnd?: boolean
}

export function InboxMessageBubble({
  message,
  isGroupStart = true,
  isGroupEnd = true,
}: InboxMessageBubbleProps) {
  const t = useTranslations('dashboard.inbox.thread')
  const isCustomer = isCustomerMessage(message)
  const body = messageBodyText(message)
  const contentType = message.contentType?.toLowerCase() ?? 'text'
  const mediaUrl = message.mediaUrl?.trim() || null

  const radius = isCustomer
    ? cn(
        'rounded-2xl',
        isGroupStart ? 'rounded-tl-md' : 'rounded-tl-sm',
        isGroupEnd ? 'rounded-bl-2xl' : 'rounded-bl-sm'
      )
    : cn(
        'rounded-2xl',
        isGroupStart ? 'rounded-tr-md' : 'rounded-tr-sm',
        isGroupEnd ? 'rounded-br-2xl' : 'rounded-br-sm'
      )

  return (
    <div
      className={cn('flex w-full', isCustomer ? 'justify-start' : 'justify-end')}
      data-message-id={message.id}
    >
      <div
        className={cn(
          'max-w-[min(85%,28rem)] px-3.5 py-2 shadow-[0_1px_2px_rgb(15_23_42/0.04)]',
          radius,
          isCustomer
            ? 'border border-dash-border bg-dash-surface text-ink'
            : 'bg-primary text-on-primary'
        )}
      >
        {contentType === 'image' && mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl"
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
              'inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium',
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
          <p
            className={cn(
              'text-sm leading-5 break-words whitespace-pre-wrap',
              (contentType === 'image' && mediaUrl) ||
                ((contentType === 'document' || contentType === 'file') && mediaUrl)
                ? 'mt-1.5'
                : null
            )}
          >
            {body}
          </p>
        ) : !mediaUrl ? (
          <p className="text-sm leading-5 break-words whitespace-pre-wrap">{t('noContent')}</p>
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
            'mt-1 text-[11px] tabular-nums',
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
