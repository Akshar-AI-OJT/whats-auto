'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { fetchMonthlyRevenueTrend, formatShortCurrency } from '../analytics/super-admin-analytics'

const WIDTH = 560
const HEIGHT = 220
const PAD = { top: 16, right: 12, bottom: 32, left: 48 }
const STALE_MS = 60_000
const MONTHS = 6

export function RevenueTrendChart({ className }: { className?: string }) {
  const t = useTranslations('admin.home.charts.revenue')
  const tAnalytics = useTranslations('admin.analytics')
  const locale = useLocale()

  const trendQuery = useQuery({
    queryKey: queryKeys.admin.analytics.monthlyRevenue(locale, MONTHS),
    queryFn: () => fetchMonthlyRevenueTrend(locale, MONTHS),
    staleTime: STALE_MS,
  })

  const data = useMemo(() => trendQuery.data ?? [], [trendQuery.data])
  const hasRevenue = data.some((d) => d.revenue > 0)

  const { bars, yTicks, max } = useMemo(() => {
    if (data.length === 0 || !hasRevenue) return { bars: [], yTicks: [], max: 0 }

    const values = data.map((d) => d.revenue)
    const peak = Math.max(...values) * 1.1
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const gap = 14
    const barW = (innerW - gap * (data.length - 1)) / data.length

    const mapped = data.map((d, i) => {
      const h = (d.revenue / peak) * innerH
      const x = PAD.left + i * (barW + gap)
      const y = PAD.top + innerH - h
      return { ...d, month: d.label, x, y, width: barW, height: h }
    })

    const ticks = [0, peak / 2, peak].map((v) => ({
      value: Math.round(v),
      y: PAD.top + innerH - (v / peak) * innerH,
    }))

    return { bars: mapped, yTicks: ticks, max: peak }
  }, [data, hasRevenue])

  return (
    <DashboardPanel
      as="section"
      className={cn('flex h-full flex-col p-4 sm:p-5 md:p-6', className)}
    >
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 min-h-0 flex-1">
        {trendQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-dash-border border-t-primary" />
          </div>
        ) : trendQuery.error ? (
          <p className="text-center text-sm text-mute">
            {trendQuery.error instanceof Error
              ? trendQuery.error.message
              : tAnalytics('unavailable')}
          </p>
        ) : !hasRevenue ? (
          <p className="text-center text-sm text-mute">{tAnalytics('unavailable')}</p>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label={t('ariaLabel', { max: formatShortCurrency(Math.round(max), locale) })}
          >
            {yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={tick.y}
                  y2={tick.y}
                  className="stroke-dash-border"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-mute text-[10px]"
                >
                  {formatShortCurrency(tick.value, locale)}
                </text>
              </g>
            ))}

            {bars.map((bar, index) => {
              const isLast = index === bars.length - 1
              return (
                <g key={bar.month}>
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx={8}
                    className={cn(
                      isLast ? 'fill-primary' : 'fill-primary/45',
                      'transition-[opacity] duration-200'
                    )}
                  />
                  <text
                    x={bar.x + bar.width / 2}
                    y={HEIGHT - 10}
                    textAnchor="middle"
                    className="fill-mute text-[11px] font-medium"
                  >
                    {bar.month}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </DashboardPanel>
  )
}
