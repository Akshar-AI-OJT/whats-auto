'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Bell,
  CheckCheck,
  CreditCard,
  Megaphone,
  MessageSquare,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { formatConversationTimestamp } from './overview/ConversationRow'

export type NotificationType = 'campaign' | 'message' | 'billing' | 'system'

export type NotificationItem = {
  id: string
  title: string
  body: string
  timestamp: string | Date
  type: NotificationType
  read: boolean
}

export type NotificationBellProps = {
  notifications?: NotificationItem[]
  className?: string
  /** Called when open state changes (for coordinating other menus). */
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

const TYPE_META: Record<
  NotificationType,
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

function cloneNotifications(items: NotificationItem[]): NotificationItem[] {
  return items.map((item) => ({ ...item }))
}

export function NotificationBell({
  notifications: initialNotifications = [],
  className,
  onOpenChange,
  open: openProp,
}: NotificationBellProps) {
  const t = useTranslations('dashboard.notifications')
  const [items, setItems] = useState(() => cloneNotifications(initialNotifications))
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const unreadCount = items.filter((item) => !item.read).length

  function setOpen(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function openPanel() {
    clearCloseTimer()
    setOpen(true)
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      if (openProp === undefined) setUncontrolledOpen(false)
      onOpenChange?.(false)
    }, 140)
  }

  useEffect(() => {
    return () => clearCloseTimer()
  }, [])

  useEffect(() => {
    if (!open) return

    function close() {
      if (openProp === undefined) setUncontrolledOpen(false)
      onOpenChange?.(false)
    }

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, openProp, onOpenChange])

  function markOneRead(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    )
  }

  function markAllAsRead() {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative shrink-0', className)}
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        title={t('title')}
        aria-label={t('title')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={cn(
          'relative inline-flex size-10 items-center justify-center rounded-xl border border-dash-border bg-canvas text-ink',
          'transition-[background-color,border-color,box-shadow] duration-200',
          'hover:bg-dash-surface',
          open && 'border-primary/45 bg-dash-surface shadow-[0_0_0_3px_rgb(159_232_112/0.14)]'
        )}
      >
        <Bell
          className={cn(
            'size-4 transition-transform duration-200',
            open && 'scale-110 text-positive-deep'
          )}
          aria-hidden
        />
        {unreadCount > 0 ? (
          <span
            className={cn(
              'absolute -top-1.5 -right-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1',
              'bg-primary text-[10px] font-bold text-on-primary',
              'shadow-[0_0_0_2px_var(--canvas)]'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('title')}
          className={cn(
            'absolute top-[calc(100%+0.45rem)] right-0 z-50 w-[min(22rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-dash-border bg-canvas',
            'dash-elevated-shadow'
          )}
          onMouseEnter={openPanel}
          onMouseLeave={scheduleClose}
        >
          <div className="flex items-center justify-between gap-3 border-b border-dash-border px-3.5 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{t('title')}</p>
              {unreadCount > 0 ? (
                <p className="mt-0.5 text-xs text-mute">
                  {t('unreadCount', { count: unreadCount })}
                </p>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllAsRead}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-positive-deep',
                  'transition-colors duration-150 hover:bg-primary-pale'
                )}
              >
                <CheckCheck className="size-3.5" aria-hidden />
                {t('markAllRead')}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-mute">{t('empty')}</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {items.map((item) => {
                const meta = TYPE_META[item.type]
                const Icon = meta.icon
                return (
                  <li key={item.id}>
                    <div
                      className={cn(
                        'group/item flex gap-3 rounded-xl px-2.5 py-2.5',
                        'transition-colors duration-150',
                        item.read ? 'hover:bg-dash-surface' : 'bg-dash-surface/80 hover:bg-dash-hover'
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
                          <p
                            className={cn(
                              'truncate text-sm text-ink',
                              item.read ? 'font-medium' : 'font-semibold'
                            )}
                          >
                            {item.title}
                          </p>
                          {!item.read ? (
                            <span
                              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                              aria-label={t('unread')}
                            />
                          ) : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-body">
                          {item.body}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <time
                            dateTime={
                              typeof item.timestamp === 'string'
                                ? item.timestamp
                                : item.timestamp.toISOString()
                            }
                            className="text-[11px] tabular-nums text-mute"
                          >
                            {formatConversationTimestamp(item.timestamp)}
                          </time>
                          {!item.read ? (
                            <button
                              type="button"
                              onClick={() => markOneRead(item.id)}
                              className={cn(
                                'text-[11px] font-semibold text-positive-deep opacity-0',
                                'transition-opacity duration-150',
                                'group-hover/item:opacity-100 focus-visible:opacity-100'
                              )}
                            >
                              {t('markRead')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function toNotificationItems(
  notifications: MockNotification[]
): NotificationItem[] {
  return notifications.map((item) => ({ ...item }))
}
