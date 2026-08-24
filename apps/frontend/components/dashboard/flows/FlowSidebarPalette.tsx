'use client'

import { useTranslations } from 'next-intl'
import { PALETTE_NODE_TYPES, FLOW_DND_TYPE, type FlowCanvasNodeType } from './flow-canvas-graph'
import { cn } from '@/lib/utils'

export function FlowSidebarPalette({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (type: Exclude<FlowCanvasNodeType, 'TRIGGER'>) => void
}) {
  const t = useTranslations('dashboard.flows.editor.palette')

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-dash-border bg-canvas p-3">
      <p className="text-xs font-medium tracking-wide text-mute uppercase">{t('title')}</p>
      <p className="mt-1 text-xs text-mute">{t('hint')}</p>
      <ul className="mt-3 space-y-1.5">
        {PALETTE_NODE_TYPES.map((type) => (
          <li key={type}>
            <button
              type="button"
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData(FLOW_DND_TYPE, type)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onAdd(type)}
              className={cn(
                'w-full rounded-lg border border-dash-border bg-dash-surface px-2.5 py-2 text-left text-sm text-ink',
                'hover:border-primary/40 hover:bg-primary-pale/50',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {t(type)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
