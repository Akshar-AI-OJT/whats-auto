'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { NotificationsList } from './notifications/NotificationsList'
import { useNotifications } from './notifications/useNotifications'

export type NotificationBellProps = {
  className?: string
  /** Called when open state changes (for coordinating other menus). */
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

export function NotificationBell({
  className,
  onOpenChange,
  open: openProp,
}: NotificationBellProps) {
  const t = useTranslations('dashboard.notifications')
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const {
    items,
    loading,
    loadingMore,
    markingAll,
    markingId,
    error,
    unreadCount,
    hasMore,
    refresh,
    loadMore,
    markAllAsRead,
    markAsRead,
  } = useNotifications({ enabled: true })

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

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
          <NotificationsList
            variant="dropdown"
            items={items}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            markingId={markingId}
            unreadCount={unreadCount}
            markingAll={markingAll}
            hasMore={hasMore}
            onMarkAllAsRead={() => void markAllAsRead()}
            onMarkAsRead={(item) => void markAsRead(item)}
            onRetry={refresh}
            onLoadMore={loadMore}
          />
          <div className="border-t border-dash-border px-3 py-2">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className={cn(
                'flex w-full items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold text-positive-deep',
                'transition-colors duration-150 hover:bg-primary-pale'
              )}
            >
              {t('viewAll')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
