'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  GitBranch,
  Headphones,
  LayoutTemplate,
  List,
  LogOut,
  MessageSquareText,
  MousePointerClick,
  Workflow,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { FLOW_DND_TYPE, PALETTE_GROUPS, type PaletteNodeType } from './flow-canvas-graph'
import { cn } from '@/lib/utils'

const PALETTE_ICONS: Record<PaletteNodeType, LucideIcon> = {
  MESSAGE: MessageSquareText,
  TEMPLATE: LayoutTemplate,
  INTERACTIVE_BUTTON: MousePointerClick,
  INTERACTIVE_LIST: List,
  CONDITION: GitBranch,
  SUBFLOW: Workflow,
  AI_RAG: Bot,
  HUMAN_HANDOVER: Headphones,
  EXIT: LogOut,
}

export function FlowSidebarPalette({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (type: PaletteNodeType) => void
}) {
  const t = useTranslations('dashboard.flows.editor.palette')

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-dash-border bg-canvas p-3">
      <p className="text-xs font-medium tracking-wide text-mute uppercase">{t('title')}</p>
      <p className="mt-1 text-xs text-mute">{t('hint')}</p>

      <div className="mt-3 flex flex-col gap-4">
        {PALETTE_GROUPS.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-mute uppercase">
              {t(`groups.${group.id}`)}
            </h3>
            <ul className="grid grid-cols-2 gap-1.5">
              {group.types.map((type) => {
                const Icon = PALETTE_ICONS[type]
                return (
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
                        'flex w-full flex-col items-center gap-1.5 rounded-lg border border-dash-border bg-dash-surface px-1.5 py-2.5 text-center',
                        'hover:border-primary/40 hover:bg-primary-pale/50',
                        'disabled:cursor-not-allowed disabled:opacity-60'
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-ink" aria-hidden />
                      <span className="text-[11px] leading-tight font-medium text-ink">
                        {t(type)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
