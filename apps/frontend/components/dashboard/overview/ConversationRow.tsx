'use client'

import { cn } from '@/lib/utils'

export type ConversationStatus = 'open' | 'waiting' | 'resolved'
export type ConversationPresence = 'online' | 'offline'

export type ConversationRowProps = {
  id: string
  name: string
  preview: string
  timestamp: string | Date
  unread?: number
  status: ConversationStatus
  presence?: ConversationPresence
  statusLabel: string
  className?: string
  onClick?: () => void
}

const STATUS_STYLES: Record<ConversationStatus, string> = {
  open: 'bg-primary-pale text-positive-deep',
  waiting: 'bg-dash-warn-soft text-warning-content',
  resolved: 'bg-dash-surface text-mute',
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Formats a timestamp into a compact relative label (e.g. Just now, 2m ago, Yesterday). */
export function formatConversationTimestamp(
  timestamp: string | Date,
  now: Date = new Date()
) {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function ConversationRow({
  name,
  preview,
  timestamp,
  unread = 0,
  status,
  presence = 'offline',
  statusLabel,
  className,
  onClick,
}: ConversationRowProps) {
  const hasUnread = unread > 0
  const timeLabel = formatConversationTimestamp(timestamp)
  const rowClassName = cn(
    'group relative flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-3 text-left',
    'transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out',
    'hover:-translate-y-px hover:border-dash-border hover:bg-dash-surface',
    'hover:shadow-[0_8px_20px_rgb(15_23_42/0.05)]',
    hasUnread && 'bg-dash-surface/70',
    onClick && 'cursor-pointer',
    className
  )

  const content = (
    <>
      <span className="relative shrink-0">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl text-xs font-bold',
            'bg-primary text-on-primary shadow-[0_4px_12px_rgb(37_99_235/0.25)]',
            'transition-transform duration-200 group-hover:scale-[1.03]'
          )}
        >
          {getInitials(name)}
        </span>
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-canvas',
            presence === 'online' ? 'bg-positive' : 'bg-dash-border-strong'
          )}
          title={presence === 'online' ? 'Online' : 'Offline'}
          aria-label={presence === 'online' ? 'Online' : 'Offline'}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm font-semibold text-ink',
              hasUnread && 'font-bold'
            )}
          >
            {name}
          </span>

          {hasUnread ? (
            <span
              className={cn(
                'inline-flex min-w-5 shrink-0 items-center justify-center rounded-md px-1.5',
                'bg-primary text-[10px] font-bold text-on-primary',
                'shadow-[0_2px_8px_rgb(37_99_235/0.35)]'
              )}
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}

          <time
            dateTime={
              typeof timestamp === 'string' ? timestamp : timestamp.toISOString()
            }
            className="ml-auto shrink-0 text-xs tabular-nums text-mute"
            title={new Date(timestamp).toLocaleString()}
          >
            {timeLabel}
          </time>
        </span>

        <span
          className={cn(
            'mt-0.5 block truncate text-sm leading-5',
            hasUnread ? 'font-medium text-ink' : 'text-body'
          )}
        >
          {preview}
        </span>

        <span
          className={cn(
            'mt-2 inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
            STATUS_STYLES[status]
          )}
        >
          {statusLabel}
        </span>
      </span>

      {hasUnread ? (
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-primary opacity-80"
        />
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClassName}>
        {content}
      </button>
    )
  }

  return <div className={rowClassName}>{content}</div>
}
