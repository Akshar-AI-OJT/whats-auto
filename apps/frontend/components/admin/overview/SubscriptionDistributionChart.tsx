'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { MOCK_SUBSCRIPTION_DISTRIBUTION } from '../mock-data'
import { cn } from '@/lib/utils'

const SIZE = 180
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function SubscriptionDistributionChart({ className }: { className?: string }) {
  const t = useTranslations('admin.home.charts.subscriptions')

  const { segments, total } = useMemo(() => {
    const sum = MOCK_SUBSCRIPTION_DISTRIBUTION.reduce((acc, s) => acc + s.count, 0)
    const segs = MOCK_SUBSCRIPTION_DISTRIBUTION.reduce<
      Array<
        (typeof MOCK_SUBSCRIPTION_DISTRIBUTION)[number] & {
          dash: number
          offset: number
          percent: number
        }
      >
    >((acc, slice) => {
      const length = (slice.count / sum) * CIRCUMFERENCE
      const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash
      acc.push({
        ...slice,
        dash: length,
        offset,
        percent: Math.round((slice.count / sum) * 100),
      })
      return acc
    }, [])
    return { segments: segs, total: sum }
  }, [])

  return (
    <DashboardPanel
      as="section"
      className={cn('flex h-full flex-col p-4 sm:p-5 md:p-6', className)}
    >
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row sm:items-center sm:gap-8">
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
                key={seg.id}
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
              key={seg.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-dash-border hover:bg-dash-surface/80"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.fill }}
                  aria-hidden
                />
                <span className="truncate text-sm font-medium text-ink">
                  {t(`plans.${seg.id}`)}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-mute">
                {seg.count}
                <span className="ml-1 text-xs">({seg.percent}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardPanel>
  )
}
