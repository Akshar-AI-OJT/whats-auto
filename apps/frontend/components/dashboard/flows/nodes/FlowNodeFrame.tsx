import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { TARGET_HANDLE, type FlowCanvasNodeType, type SourceHandleSpec } from '../flow-canvas-graph'

const TYPE_SHELL: Record<FlowCanvasNodeType, string> = {
  TRIGGER: 'border-primary/40 bg-canvas',
  MESSAGE: 'border-dash-border bg-canvas',
  TEMPLATE: 'border-dash-border bg-canvas',
  INTERACTIVE_BUTTON: 'border-dash-border bg-canvas',
  INTERACTIVE_LIST: 'border-dash-border bg-canvas',
  CONDITION: 'border-accent-cyan/35 bg-canvas',
  SUBFLOW: 'border-dash-border bg-canvas',
  AI_RAG: 'border-primary/30 bg-canvas',
  HUMAN_HANDOVER: 'border-dash-border bg-canvas',
  EXIT: 'border-dash-border bg-dash-surface',
}

const TYPE_HEADER: Record<FlowCanvasNodeType, string> = {
  TRIGGER: 'bg-primary-pale text-positive-deep',
  MESSAGE: 'bg-dash-surface text-ink',
  TEMPLATE: 'bg-dash-info-soft text-dash-info',
  INTERACTIVE_BUTTON: 'bg-primary-pale/70 text-positive-deep',
  INTERACTIVE_LIST: 'bg-primary-pale/70 text-positive-deep',
  CONDITION: 'bg-dash-info-soft text-dash-info',
  SUBFLOW: 'bg-dash-surface text-ink',
  AI_RAG: 'bg-primary-pale text-positive-deep',
  HUMAN_HANDOVER: 'bg-dash-surface text-ink',
  EXIT: 'bg-dash-surface text-mute',
}

export const sourceHandleClassName = cn(
  'size-2.5! border-2! border-canvas! bg-primary!',
  'relative! top-auto! right-auto! left-auto! transform-none! translate-x-0! translate-y-0!'
)

export function FlowNodeFrame({
  type,
  typeLabel,
  label,
  selected,
  showTarget,
  handles,
  handleLayout = 'distributed',
  headerAction,
  children,
}: {
  type: FlowCanvasNodeType
  typeLabel: string
  label: string
  selected: boolean
  showTarget: boolean
  handles: SourceHandleSpec[]
  /** `distributed` = percentage handles on the node; `inline` = children own the handles. */
  handleLayout?: 'distributed' | 'inline'
  headerAction?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        // Keep overflow visible so row/button handles can sit on the edge.
        'relative w-72 overflow-visible rounded-xl border shadow-sm',
        TYPE_SHELL[type],
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

      {/*
        Header uses the same rounded-xl as the shell so top corners share one curve.
        A smaller inner radius (e.g. 11px) left a crescent of shell bg in the corners.
      */}
      <div
        className={cn(
          'flex items-start justify-between gap-2 rounded-t-xl px-3 py-2',
          TYPE_HEADER[type]
        )}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-wide uppercase opacity-80">{typeLabel}</p>
          <p className="mt-0.5 truncate text-sm font-semibold">{label}</p>
        </div>
        {headerAction}
      </div>

      {children ? <div className="px-3 py-2.5">{children}</div> : null}

      {handleLayout === 'distributed'
        ? handles.map((handle, index) => (
            <Handle
              key={handle.id}
              type="source"
              position={Position.Right}
              id={handle.id}
              style={{ top: `${((index + 1) * 100) / (handles.length + 1)}%` }}
              className="size-2.5! border-2! border-canvas! bg-primary!"
              title={handle.label || handle.id}
            />
          ))
        : null}
    </div>
  )
}

export function InlineSourceHandle({
  id,
  title,
}: {
  id: string
  title?: string
}) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={id}
      title={title || id}
      className={sourceHandleClassName}
    />
  )
}
