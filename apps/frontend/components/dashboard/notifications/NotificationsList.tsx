'use client'

import {
  CheckCheck,
  CreditCard,
  Loader2,
  Megaphone,
  MessageSquare,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Notification } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { formatConversationTimestamp } from '../overview/ConversationRow'
import {
  formatNotificationType,
  notificationVisualCategory,
  type NotificationVisualCategory,
} from '../notification-utils'

const TYPE_META: Record<
  NotificationVisualCategory,
  { icon: LucideIcon; wrap: string; iconColor: string }
> = {
  campaign: {
    icon: Megaphone,
    wrap: 'bg-primary-pale',
    iconColor: 'text-positive-deep',
  },
  message: {
    icon: MessageSquare,
    wrap: 'bg-dash-info-soft',
    iconColor: 'text-dash-info',
  },
  billing: {
    icon: CreditCard,
    wrap: 'bg-dash-warn-soft',
    iconColor: 'text-warning-content',
  },
  system: {
    icon: Settings2,
    wrap: 'bg-dash-surface',
    iconColor: 'text-mute',
  },
}

type NotificationsListProps = {
  items: Notification[]
  loading: boolean
  loadingMore?: boolean
  error: string | null
  markingId: string | null
  unreadCount: number
  markingAll: boolean
  variant?: 'dropdown' | 'page'
  hasMore?: boolean
  page?: number
  lastPage?: number
  total?: number
  onMarkAllAsRead: () => void
  onMarkAsRead: (item: Notification) => void
  onRetry: () => void
  onLoadMore?: () => void
  onGoToPage?: (page: number) => void
}

export function NotificationsList({
  items,
  loading,
  loadingMore = false,
  error,
  markingId,
  unreadCount,
  markingAll,
  variant = 'dropdown',
  hasMore = false,
  page = 1,
  lastPage = 1,
  total = 0,
  onMarkAllAsRead,
  onMarkAsRead,
  onRetry,
  onLoadMore,
  onGoToPage,
}: NotificationsListProps) {
  const t = useTranslations('dashboard.notifications')
  const isPage = variant === 'page'

  const header = (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-dash-border',
        isPage ? 'px-0 py-0' : 'px-3.5 py-3'
      )}
    >
      <div>
        {!isPage ? (
          <>
            <p className="text-sm font-semibold text-ink">{t('title')}</p>
            {unreadCount > 0 ? (
              <p className="mt-0.5 text-xs text-mute">
                {t('unreadCount', { count: unreadCount })}
              </p>
            ) : null}
          </>
        ) : unreadCount > 0 ? (
          <p className="text-sm text-mute">{t('unreadCount', { count: unreadCount })}</p>
        ) : null}
      </div>
      {unreadCount > 0 ? (
        <button
          type="button"
          disabled={markingAll}
          onClick={() => void onMarkAllAsRead()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-positive-deep',
            'transition-colors duration-150 hover:bg-primary-pale',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {markingAll ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <CheckCheck className="size-3.5" aria-hidden />
          )}
          {t('markAllRead')}
        </button>
      ) : null}
    </div>
  )

  if (loading && items.length === 0) {
    return (
      <div className={isPage ? 'space-y-4' : undefined}>
        {!isPage ? header : null}
        <div
          className={cn(
            'flex items-center justify-center gap-2 text-sm text-body',
            isPage ? 'py-16' : 'px-4 py-10'
          )}
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className={isPage ? 'space-y-4' : undefined}>
        {!isPage ? header : null}
        <div
          className={cn(
            'flex flex-col items-center gap-3 text-center',
            isPage ? 'py-16' : 'px-4 py-10'
          )}
        >
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={isPage ? 'space-y-4' : undefined}>
        {!isPage ? header : null}
        <div
          className={cn(
            'text-center text-sm text-mute',
            isPage ? 'py-16' : 'px-4 py-10'
          )}
        >
          {t('empty')}
        </div>
      </div>
    )
  }

  return (
    <div className={isPage ? 'space-y-4' : undefined}>
      {header}
      {error ? (
        <p
          role="alert"
          className={cn(
            'text-xs text-negative',
            isPage ? 'rounded-lg border border-negative/20 bg-negative/5 px-3 py-2' : 'border-b border-dash-border px-3.5 py-2'
          )}
        >
          {error}
        </p>
      ) : null}
      <ul className={cn(isPage ? 'space-y-2' : 'max-h-80 overflow-y-auto p-1.5')}>
        {items.map((item) => {
          const category = notificationVisualCategory(item.type)
          const meta = TYPE_META[category]
          const Icon = meta.icon
          const isUnread = !item.readAt
          const isMarking = markingId === item.id

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!isUnread || isMarking}
                onClick={() => void onMarkAsRead(item)}
                className={cn(
                  'group/item flex w-full gap-3 text-left transition-colors duration-150',
                  isPage ? 'rounded-2xl border border-dash-border px-4 py-3.5' : 'rounded-xl px-2.5 py-2.5',
                  isUnread
                    ? 'cursor-pointer bg-dash-surface/80 hover:bg-dash-hover'
                    : 'cursor-default hover:bg-dash-surface',
                  isMarking && 'opacity-70'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl',
                    meta.wrap
                  )}
                >
                  <Icon className={cn('size-4', meta.iconColor)} aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-semibold tracking-wide text-mute uppercase">
                      {formatNotificationType(item.type)}
                    </p>
                    {isUnread ? (
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                        aria-label={t('unread')}
                      />
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      'mt-0.5 text-sm text-ink',
                      isUnread ? 'font-semibold' : 'font-medium',
                      !isPage && 'truncate'
                    )}
                  >
                    {item.title}
                  </p>
                  {item.body ? (
                    <p
                      className={cn(
                        'mt-0.5 text-xs leading-5 text-body',
                        isPage ? 'whitespace-pre-wrap' : 'line-clamp-2'
                      )}
                    >
                      {item.body}
                    </p>
                  ) : null}
                  <time
                    dateTime={item.createdAt}
                    className="mt-1.5 block text-[11px] tabular-nums text-mute"
                  >
                    {formatConversationTimestamp(item.createdAt)}
                  </time>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {isPage && lastPage > 1 && onGoToPage ? (
        <div className="flex items-center justify-between gap-3 border-t border-dash-border pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onGoToPage(page - 1)}
          >
            {t('prevPage')}
          </Button>
          <p className="text-xs text-mute">
            {t('pagination', { page, lastPage, total })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= lastPage || loading}
            onClick={() => onGoToPage(page + 1)}
          >
            {t('nextPage')}
          </Button>
        </div>
      ) : null}

      {!isPage && hasMore && onLoadMore ? (
        <div className="border-t border-dash-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t('loadingMore')}
              </>
            ) : (
              t('loadMore')
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
