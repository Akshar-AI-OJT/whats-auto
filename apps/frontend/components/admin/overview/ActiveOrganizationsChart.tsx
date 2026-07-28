'use client'

import { useId, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { MOCK_ACTIVE_ORG_TREND } from '../mock-data'
import { cn } from '@/lib/utils'

const WIDTH = 560
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 32, left: 40 }

export function ActiveOrganizationsChart({ className }: { className?: string }) {
  const t = useTranslations('admin.analytics.charts.activeOrganizations')
  const gradientId = useId()

  const { points, path, area, yTicks } = useMemo(() => {
    const values = MOCK_ACTIVE_ORG_TREND.map((d) => d.active)
    const min = Math.min(...values) * 0.92
    const max = Math.max(...values) * 1.04
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom

    const coords = MOCK_ACTIVE_ORG_TREND.map((d, i) => {
      const x =
        PAD.left +
        (MOCK_ACTIVE_ORG_TREND.length === 1
          ? innerW / 2
          : (i / (MOCK_ACTIVE_ORG_TREND.length - 1)) * innerW)
      const y = PAD.top + innerH - ((d.active - min) / (max - min)) * innerH
      return { x, y, ...d }
    })

    const line = coords
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')

    const areaPath = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`

    const ticks = [min, (min + max) / 2, max].map((v) => ({
      value: Math.round(v),
      y: PAD.top + innerH - ((v - min) / (max - min)) * innerH,
    }))

    return { points: coords, path: line, area: areaPath, yTicks: ticks }
  }, [])

  return (
    <DashboardPanel
      as="section"
      className={cn('flex h-full flex-col p-4 sm:p-5 md:p-6', className)}
    >
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('ariaLabel')}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38c8ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38c8ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

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
                {tick.value}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={path}
            fill="none"
            stroke="#38c8ff"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((p) => (
            <g key={p.month}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4.5}
                className="fill-canvas"
                stroke="#38c8ff"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={HEIGHT - 10}
                textAnchor="middle"
                className="fill-mute text-[11px] font-medium"
              >
                {p.month}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </DashboardPanel>
  )
}
