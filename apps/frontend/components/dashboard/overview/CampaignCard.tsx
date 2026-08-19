'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  CheckCircle2,
  Clock3,
  FilePenLine,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCampaignScheduledAt } from '@/lib/org-datetime'

export type CampaignStatus = 'sent' | 'scheduled' | 'draft'

export type CampaignCardAction = {
  id: string
  label: string
  icon?: React.ReactNode
  tone?: 'default' | 'danger'
  onSelect?: () => void
}

export type CampaignCardProps = {
  id: string
  name: string
  status: CampaignStatus
  statusLabel: string
  when: string
  /** UTC ISO instant from the API. When set with `timeZone`, formatted in org local time. */
  scheduledAt?: string | null
  /** Organization IANA timezone (`organizations.timezone`). */
  timeZone?: string
  sentLabel: string
  deliveredLabel: string
  progressLabel: string
  sent: string
  deliveredPercent: number | null
  progress: number
  actions?: CampaignCardAction[]
  className?: string
}

const STATUS_META: Record<
  CampaignStatus,
  {
    badge: string
    bar: string
    icon: typeof CheckCircle2
  }
> = {
  sent: {
    badge: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
    bar: 'bg-primary',
    icon: CheckCircle2,
  },
  scheduled: {
    badge: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
    bar: 'bg-accent-cyan',
    icon: Clock3,
  },
  draft: {
    badge: 'bg-dash-surface text-mute ring-1 ring-dash-border',
    bar: 'bg-mute',
    icon: FilePenLine,
  },
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatDelivery(value: number | null) {
  if (value === null) return '—'
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`
}

export function CampaignCard({
  name,
  status,
  statusLabel,
  when,
  scheduledAt,
  timeZone,
  sentLabel,
  deliveredLabel,
  progressLabel,
  sent,
  deliveredPercent,
  progress,
  actions = [],
  className,
}: CampaignCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const meta = STATUS_META[status]
  const StatusIcon = meta.icon
  const progressValue = clampPercent(progress)
  const deliveryValue =
    deliveredPercent === null ? null : clampPercent(deliveredPercent)
  const whenLabel =
    scheduledAt && timeZone
      ? formatCampaignScheduledAt(scheduledAt, timeZone) || when
      : when

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <article
      className={cn(
        'group relative rounded-2xl border border-dash-border/80 bg-dash-surface/60 px-3.5 py-3.5',
        'transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out',
        'hover:-translate-y-px hover:border-dash-border-strong hover:bg-canvas',
        'hover:shadow-[0_8px_20px_rgb(15_23_42/0.05)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="mt-0.5 text-xs text-mute">{whenLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold',
              meta.badge
            )}
          >
            <StatusIcon className="size-3" aria-hidden />
            {statusLabel}
          </span>

          {actions.length > 0 ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label="Campaign actions"
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-lg text-mute',
                  'transition-[background-color,color,opacity] duration-150',
                  'opacity-70 hover:bg-canvas-soft hover:text-ink hover:opacity-100',
                  'group-hover:opacity-100',
                  menuOpen && 'bg-canvas-soft text-ink opacity-100'
                )}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>

              {menuOpen ? (
                <ul
                  id={menuId}
                  role="menu"
                  className={cn(
                    'absolute top-[calc(100%+0.35rem)] right-0 z-20 min-w-[10.5rem] overflow-hidden rounded-xl border border-dash-border bg-canvas py-1',
                    'shadow-[0_12px_32px_rgb(15_23_42/0.1),0_2px_6px_rgb(15_23_42/0.04)]'
                  )}
                >
                  {actions.map((action) => (
                    <li key={action.id} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium',
                          action.tone === 'danger'
                            ? 'text-negative hover:bg-dash-danger-soft'
                            : 'text-ink hover:bg-dash-surface'
                        )}
                        onClick={() => {
                          setMenuOpen(false)
                          action.onSelect?.()
                        }}
                      >
                        {action.icon ? (
                          <span className="text-mute [&_svg]:size-3.5">
                            {action.icon}
                          </span>
                        ) : null}
                        {action.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-body">
        <span>
          <span className="text-mute">{sentLabel}: </span>
          <span className="font-semibold tabular-nums text-ink">{sent}</span>
        </span>
        <span>
          <span className="text-mute">{deliveredLabel}: </span>
          <span className="font-semibold tabular-nums text-ink">
            {formatDelivery(deliveryValue)}
          </span>
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-mute">{progressLabel}</span>
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            {Math.round(progressValue)}%
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-dash-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressValue)}
          aria-label={`${name} progress`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              meta.bar
            )}
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>
    </article>
  )
}
