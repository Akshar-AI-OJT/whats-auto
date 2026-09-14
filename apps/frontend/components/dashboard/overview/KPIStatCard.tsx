'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '../ui/DashboardPanel'

export type KPIStatTrend = 'up' | 'down' | 'neutral'

export type KPIStatValueFormat = 'number' | 'percent' | 'plain'

export type KPIStatCardProps = {
  label: string
  /** Numeric target for count-up, or a pre-formatted string when `format` is `plain`. */
  value: number | string
  format?: KPIStatValueFormat
  decimals?: number
  prefix?: string
  suffix?: string
  hint?: string
  delta?: string
  trend?: KPIStatTrend
  icon: LucideIcon
  loading?: boolean
  /** Animate value on mount. Respects `prefers-reduced-motion`. */
  animate?: boolean
  /** When set, the card is a navigational link and shows a pointer cursor. */
  href?: string
  className?: string
}

type ParsedValue = {
  numeric: number
  decimals: number
  prefix: string
  suffix: string
  plain?: string
}

function parseStatValue(
  value: number | string,
  format: KPIStatValueFormat,
  decimals?: number,
  prefix = '',
  suffix = ''
): ParsedValue {
  if (format === 'plain' || typeof value === 'string') {
    const raw = String(value).trim()
    if (format === 'plain') {
      return { numeric: 0, decimals: 0, prefix: '', suffix: '', plain: raw }
    }

    if (raw.endsWith('%')) {
      const numeric = Number.parseFloat(raw.replace('%', ''))
      return {
        numeric: Number.isFinite(numeric) ? numeric : 0,
        decimals: decimals ?? 1,
        prefix,
        suffix: suffix || '%',
      }
    }

    const cleaned = raw.replace(/,/g, '')
    const numeric = Number.parseFloat(cleaned)
    const hasDecimals = cleaned.includes('.')
    return {
      numeric: Number.isFinite(numeric) ? numeric : 0,
      decimals: decimals ?? (hasDecimals ? 1 : 0),
      prefix,
      suffix,
    }
  }

  return {
    numeric: value,
    decimals: decimals ?? (Number.isInteger(value) ? 0 : 1),
    prefix,
    suffix,
  }
}

function formatStatValue(value: number, decimals: number, prefix: string, suffix: string) {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)

  return `${prefix}${formatted}${suffix}`
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}

function useCountUp(
  target: number,
  { duration = 1100, enabled = true }: { duration?: number; enabled?: boolean }
) {
  const reducedMotion = usePrefersReducedMotion()
  const shouldAnimate = enabled && !reducedMotion
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!shouldAnimate) return

    let frame = 0
    let start: number | null = null
    const from = 0

    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

    const step = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      setCurrent(from + (target - from) * easeOutCubic(progress))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, shouldAnimate])

  return shouldAnimate ? current : target
}

function TrendBadge({ trend, delta }: { trend: KPIStatTrend; delta: string }) {
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums',
        trend === 'up' && 'bg-primary-pale text-positive-deep',
        trend === 'down' && 'bg-dash-danger-soft text-negative',
        trend === 'neutral' && 'bg-dash-surface text-mute'
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{delta}</span>
    </span>
  )
}

export function KPIStatCardSkeleton({ className }: { className?: string }) {
  return (
    <DashboardPanel
      className={cn(
        'flex h-full flex-col p-4 sm:p-5 lg:p-6',
        'animate-pulse',
        className
      )}
      aria-hidden
    >
      <div className="flex items-start justify-between gap-3">
        <div className="h-4 w-24 rounded-md bg-dash-border" />
        <div className="size-10 rounded-xl bg-dash-border sm:size-11" />
      </div>
      <div className="mt-4 h-8 w-28 rounded-md bg-dash-border sm:mt-5 sm:h-9" />
      <div className="mt-auto flex items-center gap-2 pt-4 sm:pt-5">
        <div className="h-6 w-16 rounded-lg bg-dash-border" />
        <div className="h-4 w-20 rounded-md bg-dash-border" />
      </div>
    </DashboardPanel>
  )
}

export function KPIStatCard({
  label,
  value,
  format = 'number',
  decimals,
  prefix = '',
  suffix = '',
  hint,
  delta,
  trend = 'neutral',
  icon: Icon,
  loading = false,
  animate = true,
  href,
  className,
}: KPIStatCardProps) {
  const parsed = useMemo(
    () => parseStatValue(value, format, decimals, prefix, suffix),
    [value, format, decimals, prefix, suffix]
  )

  const animatedValue = useCountUp(parsed.numeric, {
    enabled: animate && format !== 'plain' && !loading,
  })

  const displayValue =
    format === 'plain'
      ? (parsed.plain ?? String(value))
      : formatStatValue(animatedValue, parsed.decimals, parsed.prefix, parsed.suffix)

  if (loading) {
    return <KPIStatCardSkeleton className={className} />
  }

  const panel = (
    <DashboardPanel
      className={cn(
        'group relative flex h-full flex-col p-4 sm:p-5 lg:p-6',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-dash-border-strong',
        'hover:dash-elevated-shadow',
        href && 'cursor-pointer',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <p className="min-w-0 text-sm font-medium leading-5 text-mute">{label}</p>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 sm:rounded-2xl',
            'bg-primary-pale text-positive-deep',
            'shadow-[0_4px_12px_rgb(37_99_235/0.22)]',
            'transition-[transform,background-color,box-shadow] duration-200',
            'group-hover:scale-[1.03] group-hover:bg-primary group-hover:text-on-primary',
            'group-hover:shadow-[0_6px_16px_rgb(37_99_235/0.35)]'
          )}
        >
          <Icon className="size-[18px] sm:size-5" aria-hidden />
        </span>
      </div>

      <p
        className={cn(
          'mt-3 font-display text-2xl font-semibold tracking-tight text-ink tabular-nums sm:mt-4 sm:text-3xl',
          'transition-[transform] duration-200 group-hover:translate-y-[-1px]'
        )}
      >
        {displayValue}
      </p>

      <div
        className={cn(
          'mt-auto pt-4 sm:pt-5',
          delta || hint ? 'flex min-h-10 flex-wrap items-center gap-2' : 'min-h-6'
        )}
      >
        {delta ? <TrendBadge trend={trend} delta={delta} /> : null}
        {hint ? <span className="text-xs leading-5 text-mute">{hint}</span> : null}
      </div>
    </DashboardPanel>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full cursor-pointer rounded-[24px]" aria-label={label}>
        {panel}
      </Link>
    )
  }

  return panel
}
