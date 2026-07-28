'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  FileText,
  Megaphone,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatConversationTimestamp } from './ConversationRow'

export type ActivityTone = 'green' | 'blue' | 'amber' | 'neutral'

export type ActivityType = 'campaign' | 'contact' | 'template' | 'inbox'

export type ActivityItemProps = {
  id: string
  title: string
  detail: string
  timestamp: string | Date
  type?: ActivityType
  tone?: ActivityTone
  icon?: LucideIcon
  isLast?: boolean
  className?: string
  onClick?: () => void
}

const TONE_STYLES: Record<
  ActivityTone,
  {
    iconWrap: string
    icon: string
    rail: string
  }
> = {
  green: {
    iconWrap: 'bg-primary-pale ring-1 ring-primary/30',
    icon: 'text-positive-deep',
    rail: 'bg-primary/45',
  },
  blue: {
    iconWrap: 'bg-dash-info-soft ring-1 ring-accent-cyan/30',
    icon: 'text-dash-info',
    rail: 'bg-accent-cyan/45',
  },
  amber: {
    iconWrap: 'bg-dash-warn-soft ring-1 ring-warning/40',
    icon: 'text-warning-content',
    rail: 'bg-warning/55',
  },
  neutral: {
    iconWrap: 'bg-dash-surface ring-1 ring-dash-border',
    icon: 'text-mute',
    rail: 'bg-dash-border-strong',
  },
}

const TYPE_ICONS: Record<ActivityType, LucideIcon> = {
  campaign: Megaphone,
  contact: UserPlus,
  template: FileText,
  inbox: AlertTriangle,
}

/** Relative/"now"-based labels are computed only after mount to avoid hydration drift. */
function useRelativeTimestamp(timestamp: string | Date) {
  const dateTime =
    typeof timestamp === 'string' ? timestamp : timestamp.toISOString()
  const isServer = typeof window === 'undefined'

  const relativeLabel = useMemo(
    () => (isServer ? null : formatConversationTimestamp(timestamp)),
    [isServer, timestamp]
  )

  const absoluteLabel = useMemo(
    () => (isServer ? undefined : new Date(timestamp).toLocaleString()),
    [isServer, timestamp]
  )

  return { dateTime, relativeLabel, absoluteLabel }
}

export function ActivityItem({
  title,
  detail,
  timestamp,
  type = 'campaign',
  tone = 'neutral',
  icon,
  isLast = false,
  className,
  onClick,
}: ActivityItemProps) {
  const Icon = icon ?? TYPE_ICONS[type]
  const styles = TONE_STYLES[tone]
  const { dateTime, relativeLabel, absoluteLabel } = useRelativeTimestamp(timestamp)

  const rowClassName = cn(
    'group relative flex w-full gap-3.5 text-left sm:gap-4',
    onClick && 'cursor-pointer',
    className
  )

  const content = (
    <>
      <span className="relative flex w-9 shrink-0 flex-col items-center">
        <span
          className={cn(
            'relative z-10 flex size-9 items-center justify-center rounded-xl',
            'transition-transform duration-200 group-hover:scale-[1.04]',
            styles.iconWrap
          )}
        >
          <Icon className={cn('size-4', styles.icon)} aria-hidden />
        </span>
        {!isLast ? (
          <span
            aria-hidden
            className={cn('mt-2.5 w-px flex-1 min-h-4', styles.rail)}
          />
        ) : null}
      </span>

      <span className={cn('min-w-0 flex-1 pt-1', isLast ? 'pb-0' : 'pb-6')}>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5 text-ink transition-colors duration-200 group-hover:text-positive-deep">
              {title}
            </span>
            <span className="mt-1.5 block text-sm leading-6 text-body">{detail}</span>
          </span>
          <time
            dateTime={dateTime}
            title={absoluteLabel}
            className="shrink-0 pt-0.5 text-xs tabular-nums text-mute"
            suppressHydrationWarning
          >
            {relativeLabel ?? '\u00a0'}
          </time>
        </span>
      </span>
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
