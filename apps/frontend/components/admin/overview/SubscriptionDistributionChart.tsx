'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  fetchAllSubscriptions,
  fetchAllPlans,
  computePlanDistribution,
  type BreakdownItem,
} from '../analytics/super-admin-analytics'
import { cn } from '@/lib/utils'

const SIZE = 180
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const PLAN_COLORS: Record<string, string> = {
  starter: '#94a3b8',
  growth: '#2563eb',
  pro: '#38c8ff',
  enterprise: '#2563eb',
  scale: '#a78bfa',
}

const FALLBACK_COLORS = ['#94a3b8', '#2563eb', '#38c8ff', '#2563eb', '#a78bfa', '#f59e0b', '#ef4444']

function getColor(label: string, index: number): string {
  const key = label.toLowerCase()
  return PLAN_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

export function SubscriptionDistributionChart({ className }: { className?: string }) {
  const t = useTranslations('admin.home.charts.subscriptions')
  const tAnalytics = useTranslations('admin.analytics')
  const [distribution, setDistribution] = useState<BreakdownItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [subscriptions, plans] = await Promise.all([
          fetchAllSubscriptions(),
          fetchAllPlans(),
        ])
        if (!cancelled) setDistribution(computePlanDistribution(subscriptions, plans))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : tAnalytics('unavailable'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tAnalytics])

  const { segments, total } = useMemo(() => {
    if (distribution.length === 0) return { segments: [], total: 0 }
    const sum = distribution.reduce((acc, s) => acc + s.value, 0)
    const segs = distribution.reduce<
      Array<BreakdownItem & { dash: number; offset: number; percent: number; fill: string }>
    >((acc, slice, index) => {
      const length = (slice.value / sum) * CIRCUMFERENCE
      const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash
      acc.push({
        ...slice,
        dash: length,
        offset,
        percent: Math.round((slice.value / sum) * 100),
        fill: getColor(slice.label, index),
      })
      return acc
    }, [])
    return { segments: segs, total: sum }
  }, [distribution])

  return (
    <DashboardPanel
      as="section"
      className={cn('flex h-full flex-col p-4 sm:p-5 md:p-6', className)}
    >
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-dash-border border-t-primary" />
          </div>
        ) : error ? (
          <p className="text-center text-sm text-mute">{error}</p>
        ) : segments.length === 0 ? (
          <p className="text-center text-sm text-mute">{tAnalytics('unavailable')}</p>
        ) : (
          <>
            <div className="relative shrink-0">
              <svg
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="-rotate-90"
                role="img"
                aria-label={t('ariaLabel')}
              >
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  className="stroke-dash-border"
                  strokeWidth={STROKE}
                />
                {segments.map((seg) => (
                  <circle
                    key={seg.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={seg.fill}
                    strokeWidth={STROKE}
                    strokeDasharray={`${seg.dash} ${CIRCUMFERENCE - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex rotate-0 flex-col items-center justify-center">
                <p className="font-display text-2xl font-semibold tabular-nums text-ink">
                  {total}
                </p>
                <p className="text-[11px] font-medium text-mute">{t('totalLabel')}</p>
              </div>
            </div>

            <ul className="flex w-full min-w-0 flex-col gap-2.5 sm:max-w-[14rem]">
              {segments.map((seg) => (
                <li
                  key={seg.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-dash-border hover:bg-dash-surface/80"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.fill }}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium text-ink">
                      {seg.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-mute">
                    {seg.value}
                    <span className="ml-1 text-xs">({seg.percent}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </DashboardPanel>
  )
}
