import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { TARGET_HANDLE, type FlowCanvasNodeType, type SourceHandleSpec } from '../flow-canvas-graph'

const TYPE_TONE: Record<FlowCanvasNodeType, string> = {
  TRIGGER: 'border-primary/40 bg-primary-pale',
  MESSAGE: 'border-dash-border bg-canvas',
  TEMPLATE: 'border-dash-border bg-canvas',
  INTERACTIVE_BUTTON: 'border-dash-border bg-canvas',
  INTERACTIVE_LIST: 'border-dash-border bg-canvas',
  CONDITION: 'border-accent-cyan/35 bg-dash-info-soft',
  SUBFLOW: 'border-dash-border bg-canvas',
  AI_RAG: 'border-primary/30 bg-primary-pale/70',
  HUMAN_HANDOVER: 'border-dash-border bg-canvas',
  EXIT: 'border-dash-border bg-dash-surface',
}

export function FlowNodeFrame({
  type,
  typeLabel,
  label,
  selected,
  showTarget,
  handles,
  children,
}: {
  type: FlowCanvasNodeType
  typeLabel: string
  label: string
  selected: boolean
  showTarget: boolean
  handles: SourceHandleSpec[]
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'min-w-44 max-w-55 rounded-xl border px-3 py-2 shadow-sm',
        TYPE_TONE[type],
        selected ? 'ring-2 ring-primary/45' : null
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          id={TARGET_HANDLE}
          className="size-2.5! border-2! border-canvas! bg-primary!"
        />
      ) : null}
      <p className="text-[10px] font-medium tracking-wide text-mute uppercase">{typeLabel}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink">{label}</p>
      {children}
      {handles.map((handle, index) => (
        <Handle
          key={handle.id}
          type="source"
          position={Position.Right}
          id={handle.id}
          style={{ top: `${((index + 1) * 100) / (handles.length + 1)}%` }}
          className="size-2.5! border-2! border-canvas! bg-primary!"
          title={handle.label || handle.id}
        />
      ))}
    </div>
  )
}
