'use client'

import { cn } from '@/lib/utils'

type LimitMeterProps = {
  label: string
  used: number
  limit: number | null
  formatValue?: (n: number) => string
  className?: string
}

/**
 * Displays used/limit progress for plan meters. Unlimited when limit is null.
 */
export function LimitMeter({
  label,
  used,
  limit,
  formatValue = (n) => String(n),
  className,
}: LimitMeterProps) {
  const percent = limit === null || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100)
  const warn = percent >= 80
  const full = limit !== null && used >= limit

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className={cn('text-xs', full ? 'text-negative' : warn ? 'text-amber-700' : 'text-mute')}>
          {formatValue(used)}
          {limit === null ? ' / ∞' : ` / ${formatValue(limit)}`}
        </span>
      </div>
      {limit !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-dash-border/60">
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              full ? 'bg-negative' : warn ? 'bg-amber-500' : 'bg-primary'
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
