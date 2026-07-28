'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { MOCK_MESSAGE_VOLUME_TREND } from '../mock-data'
import { cn } from '@/lib/utils'

const WIDTH = 560
const HEIGHT = 220
const PAD = { top: 16, right: 12, bottom: 32, left: 48 }

function formatShort(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  }
  return `${value}`
}

export function MessageVolumeChart({ className }: { className?: string }) {
  const t = useTranslations('admin.analytics.charts.messageVolume')

  const { bars, yTicks, max } = useMemo(() => {
    const values = MOCK_MESSAGE_VOLUME_TREND.map((d) => d.messages)
    const peak = Math.max(...values) * 1.1
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const gap = 14
    const barW =
      (innerW - gap * (MOCK_MESSAGE_VOLUME_TREND.length - 1)) /
      MOCK_MESSAGE_VOLUME_TREND.length

    const mapped = MOCK_MESSAGE_VOLUME_TREND.map((d, i) => {
      const h = (d.messages / peak) * innerH
      const x = PAD.left + i * (barW + gap)
      const y = PAD.top + innerH - h
      return { ...d, x, y, width: barW, height: h }
    })

    const ticks = [0, peak / 2, peak].map((v) => ({
      value: Math.round(v),
      y: PAD.top + innerH - (v / peak) * innerH,
    }))

    return { bars: mapped, yTicks: ticks, max: peak }
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
          aria-label={t('ariaLabel', { max: formatShort(Math.round(max)) })}
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
                {formatShort(tick.value)}
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
                    isLast ? 'fill-accent-cyan' : 'fill-accent-cyan/45',
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
      </div>
    </DashboardPanel>
  )
}
