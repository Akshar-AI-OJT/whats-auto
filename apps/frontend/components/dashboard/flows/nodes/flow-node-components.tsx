import { memo, useState, type ReactNode } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import {
  META_INTERACTIVE_LIMITS,
  asRecord,
  asString,
  countListRows,
  newCanvasId,
  nodeLabel,
  sourceHandlesForNode,
  type FlowCanvasNodeType,
  type FlowRfNode,
} from '../flow-canvas-graph'
import { useFlowEditor } from '../flow-editor-context'
import { FlowNodeFrame, InlineSourceHandle } from './FlowNodeFrame'
import { TemplateNodePreview } from './TemplateNodePreview'

const nodrag = 'nodrag nopan nowheel'

function canvasInputClass(extra?: string) {
  return [
    nodrag,
    'w-full rounded-md border border-dash-border bg-canvas px-2 py-1 text-[11px] text-ink outline-none',
    'focus-visible:border-primary/55 focus-visible:ring-1 focus-visible:ring-primary/30',
    'disabled:cursor-not-allowed disabled:opacity-60',
    extra ?? '',
  ].join(' ')
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dash-border/80 bg-[#DCF8C6]/55 px-2.5 py-2 text-[11px] leading-4 text-ink">
      {children}
    </div>
  )
}

function TriggerBody() {
  const t = useTranslations('dashboard.flows.editor')
  const { triggerType, triggerKeywords, readOnly, patchTriggerKeywords } = useFlowEditor()
  const [draft, setDraft] = useState('')

  if (triggerType === 'INBOUND_ANY') {
    return <p className="text-[11px] text-mute">{t('canvas.anyInbound')}</p>
  }
  if (triggerType === 'CAMPAIGN_REPLY') {
    return <p className="text-[11px] text-mute">{t('canvas.campaignReply')}</p>
  }
  if (triggerType === 'SUBFLOW_ENTRY') {
    return <p className="text-[11px] text-mute">{t('canvas.subflowEntry')}</p>
  }

  function addKeyword(raw: string) {
    const keyword = raw.trim()
    if (!keyword || readOnly) return
    if (triggerKeywords.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
      setDraft('')
      return
    }
    patchTriggerKeywords([...triggerKeywords, keyword])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <ul className="flex flex-wrap gap-1">
        {triggerKeywords.map((keyword) => (
          <li
            key={keyword}
            className="inline-flex items-center gap-0.5 rounded-md border border-primary/25 bg-primary-pale px-1.5 py-0.5 text-[10px] font-medium text-positive-deep"
          >
            {keyword}
            {!readOnly ? (
              <button
                type="button"
                className={`${nodrag} rounded p-0.5 hover:bg-canvas`}
                aria-label={t('canvas.removeKeyword', { keyword })}
                onClick={() =>
                  patchTriggerKeywords(triggerKeywords.filter((item) => item !== keyword))
                }
              >
                <X className="size-2.5" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <input
          className={canvasInputClass()}
          value={draft}
          placeholder={t('canvas.addKeyword')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addKeyword(draft)
            }
          }}
          onBlur={() => addKeyword(draft)}
        />
      ) : triggerKeywords.length === 0 ? (
        <p className="text-[11px] text-mute">{t('canvas.noKeywords')}</p>
      ) : null}
    </div>
  )
}

function MessageBody({
  nodeId,
  data,
}: {
  nodeId: string
  data: Record<string, unknown>
}) {
  const t = useTranslations('dashboard.flows.editor')
  const { readOnly, patchNodeData } = useFlowEditor()
  const messageType = asString(data.messageType) || 'text'
  if (messageType !== 'text') {
    return (
      <Bubble>
        <p className="font-medium capitalize">{messageType}</p>
        {asString(data.caption).trim() ? (
          <p className="mt-1 line-clamp-3 text-mute">{asString(data.caption)}</p>
        ) : (
          <p className="mt-1 text-mute">{t('canvas.mediaAsset')}</p>
        )}
      </Bubble>
    )
  }
  return (
    <textarea
      className={canvasInputClass('min-h-16 resize-y')}
      value={asString(data.text)}
      disabled={readOnly}
      placeholder={t('fields.text')}
      onChange={(event) => patchNodeData(nodeId, { text: event.target.value })}
    />
  )
}

function TemplateBody({ data }: { data: Record<string, unknown> }) {
  const { templatesById } = useFlowEditor()
  const templateId = asString(data.messageTemplateId)
  const template = templateId ? (templatesById.get(templateId) ?? null) : null
  return <TemplateNodePreview template={template} />
}

function ButtonsBody({
  nodeId,
  data,
}: {
  nodeId: string
  data: Record<string, unknown>
}) {
  const t = useTranslations('dashboard.flows.editor')
  const { readOnly, patchNodeData, removeHandles } = useFlowEditor()
  const buttons = Array.isArray(data.buttons) ? data.buttons.map(asRecord) : []

  function setButtons(next: Record<string, unknown>[]) {
    patchNodeData(nodeId, { buttons: next })
  }

  return (
    <div className="space-y-2">
      <textarea
        className={canvasInputClass('min-h-14 resize-y')}
        value={asString(data.bodyText)}
        disabled={readOnly}
        placeholder={t('fields.bodyText')}
        onChange={(event) => patchNodeData(nodeId, { bodyText: event.target.value })}
      />
      <ul className="space-y-1.5">
        {buttons.map((button, index) => {
          const id = asString(button.id).trim() || `btn_${index + 1}`
          const title = asString(button.title)
          return (
            <li
              key={id}
              className="relative flex min-h-7 items-center gap-1 rounded-md border border-dash-border/70 bg-dash-surface/60 px-2 py-1"
            >
              <input
                className={canvasInputClass('flex-1')}
                value={title}
                maxLength={META_INTERACTIVE_LIMITS.buttonTitleMax}
                disabled={readOnly}
                placeholder={t('fields.buttonTitle')}
                onChange={(event) => {
                  setButtons(
                    buttons.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item
                    )
                  )
                }}
              />
              {!readOnly && buttons.length > 1 ? (
                <button
                  type="button"
                  className={`${nodrag} rounded p-0.5 text-mute hover:text-ink`}
                  aria-label={t('removeButton')}
                  onClick={() => {
                    setButtons(buttons.filter((_, i) => i !== index))
                    removeHandles(nodeId, [id])
                  }}
                >
                  <X className="size-3" aria-hidden />
                </button>
              ) : null}
              <InlineSourceHandle id={id} title={title || id} />
            </li>
          )
        })}
      </ul>
      {!readOnly && buttons.length < META_INTERACTIVE_LIMITS.maxButtons ? (
        <button
          type="button"
          className={`${nodrag} text-[10px] font-medium text-positive-deep`}
          onClick={() =>
            setButtons([...buttons, { id: newCanvasId('btn'), title: 'OK', actionType: 'DEFAULT' }])
          }
        >
          {t('addButton')}
        </button>
      ) : null}
    </div>
  )
}

function ListBody({ nodeId, data }: { nodeId: string; data: Record<string, unknown> }) {
  const t = useTranslations('dashboard.flows.editor')
  const { readOnly, patchNodeData, removeHandles } = useFlowEditor()
  const sections = Array.isArray(data.sections) ? data.sections.map(asRecord) : []
  const rowCount = countListRows(data)
  const canAddRow = !readOnly && rowCount < META_INTERACTIVE_LIMITS.maxListRows

  function setSections(next: Record<string, unknown>[]) {
    patchNodeData(nodeId, { sections: next })
  }

  return (
    <div className="space-y-2">
      <textarea
        className={canvasInputClass('min-h-14 resize-y')}
        value={asString(data.bodyText)}
        disabled={readOnly}
        placeholder={t('fields.bodyText')}
        onChange={(event) => patchNodeData(nodeId, { bodyText: event.target.value })}
      />
      <input
        className={canvasInputClass('text-center font-semibold')}
        value={asString(data.buttonTitle)}
        maxLength={META_INTERACTIVE_LIMITS.listButtonTitleMax}
        disabled={readOnly}
        placeholder={t('fields.listButtonTitle')}
        onChange={(event) => patchNodeData(nodeId, { buttonTitle: event.target.value })}
      />
      {sections.map((section, sectionIndex) => {
        const rows = Array.isArray(section.rows) ? section.rows.map(asRecord) : []
        return (
          <div key={`section-${sectionIndex}`} className="space-y-1.5">
            <input
              className={canvasInputClass('text-[10px] font-semibold uppercase tracking-wide')}
              value={asString(section.title)}
              maxLength={META_INTERACTIVE_LIMITS.sectionTitleMax}
              disabled={readOnly}
              required
              placeholder={t('fields.sectionTitle')}
              onChange={(event) =>
                setSections(
                  sections.map((item, i) =>
                    i === sectionIndex ? { ...item, title: event.target.value } : item
                  )
                )
              }
            />
            <ul className="space-y-1.5">
              {rows.map((row, rowIndex) => {
                const id = asString(row.id).trim()
                if (!id) return null
                return (
                  <li
                    key={`${id}-${rowIndex}`}
                    className="relative flex min-h-7 items-center gap-1 rounded-md border border-dash-border/70 bg-dash-surface/60 px-2 py-1"
                  >
                    <input
                      className={canvasInputClass('flex-1')}
                      value={asString(row.title)}
                      maxLength={META_INTERACTIVE_LIMITS.rowTitleMax}
                      disabled={readOnly}
                      placeholder={t('fields.rowTitle')}
                      onChange={(event) => {
                        setSections(
                          sections.map((item, i) => {
                            if (i !== sectionIndex) return item
                            return {
                              ...item,
                              rows: rows.map((r, ri) =>
                                ri === rowIndex ? { ...r, title: event.target.value } : r
                              ),
                            }
                          })
                        )
                      }}
                    />
                    {!readOnly && rowCount > 1 ? (
                      <button
                        type="button"
                        className={`${nodrag} rounded p-0.5 text-mute hover:text-ink`}
                        aria-label={t('removeRow')}
                        onClick={() => {
                          const nextRows = rows.filter((_, ri) => ri !== rowIndex)
                          const next =
                            nextRows.length === 0 && sections.length > 1
                              ? sections.filter((_, i) => i !== sectionIndex)
                              : sections.map((item, i) =>
                                  i === sectionIndex ? { ...item, rows: nextRows } : item
                                )
                          setSections(next)
                          removeHandles(nodeId, [id])
                        }}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    ) : null}
                    <InlineSourceHandle id={id} title={asString(row.title) || id} />
                  </li>
                )
              })}
            </ul>
            {canAddRow ? (
              <button
                type="button"
                className={`${nodrag} text-[10px] font-medium text-positive-deep`}
                onClick={() =>
                  setSections(
                    sections.map((item, i) =>
                      i === sectionIndex
                        ? {
                            ...item,
                            rows: [
                              ...rows,
                              { id: newCanvasId('row'), title: 'Option', actionType: 'DEFAULT' },
                            ],
                          }
                        : item
                    )
                  )
                }
              >
                {t('addRow')}
              </button>
            ) : null}
            {!readOnly && sections.length > 1 ? (
              <button
                type="button"
                className={`${nodrag} text-[10px] font-medium text-mute`}
                onClick={() => {
                  const removedIds = rows.map((row) => asString(row.id).trim()).filter(Boolean)
                  setSections(sections.filter((_, i) => i !== sectionIndex))
                  removeHandles(nodeId, removedIds)
                }}
              >
                {t('removeSection')}
              </button>
            ) : null}
          </div>
        )
      })}
      {canAddRow ? (
        <button
          type="button"
          className={`${nodrag} text-[10px] font-medium text-positive-deep`}
          onClick={() =>
            setSections([
              ...sections,
              {
                title: '',
                rows: [{ id: newCanvasId('row'), title: 'Option', actionType: 'DEFAULT' }],
              },
            ])
          }
        >
          {t('addSection')}
        </button>
      ) : null}
    </div>
  )
}

function ConditionBody({ data }: { data: Record<string, unknown> }) {
  const conditions = Array.isArray(data.conditions) ? data.conditions.map(asRecord) : []
  const fallback = asString(data.fallbackHandle).trim() || 'else'
  return (
    <ul className="space-y-1.5">
      {conditions.map((condition, index) => {
        const id = asString(condition.id).trim() || `if_${index + 1}`
        const variableKey = asString(condition.variableKey).trim() || 'variable'
        const operator = asString(condition.operator).trim() || 'equals'
        const value = asString(condition.value).trim()
        return (
          <li
            key={id}
            className="relative flex min-h-7 items-center gap-2 rounded-md border border-dash-border/70 bg-dash-surface/60 px-2 py-1"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-ink">{id}</p>
              <p className="truncate text-[10px] text-mute">
                {variableKey} {operator} {value}
              </p>
            </div>
            <InlineSourceHandle id={id} title={id} />
          </li>
        )
      })}
      <li className="relative flex min-h-7 items-center gap-2 rounded-md border border-dash-border/70 bg-dash-surface/60 px-2 py-1">
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{fallback}</p>
        <InlineSourceHandle id={fallback} title={fallback} />
      </li>
    </ul>
  )
}

function SubflowBody({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations('dashboard.flows.editor')
  const { publishedFlowsById } = useFlowEditor()
  const subflowId = asString(data.subflowId)
  const name = subflowId ? publishedFlowsById.get(subflowId)?.name : null
  return (
    <p className="truncate text-[11px] text-mute">
      {name || (subflowId ? subflowId : t('fields.subflowPlaceholder'))}
    </p>
  )
}

function AiRagBody({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations('dashboard.flows.editor')
  const fallbackAction = asString(data.fallbackAction) || 'HUMAN_HANDOVER'
  const appendix = asString(data.promptAppendix).trim()
  const handle = asString(data.fallbackTargetHandle).trim()
  return (
    <div className="space-y-2">
      {appendix ? (
        <p className="line-clamp-3 text-[11px] text-mute">{appendix}</p>
      ) : (
        <p className="text-[11px] text-mute">{t('canvas.aiRagHint')}</p>
      )}
      {fallbackAction === 'ROUTE_EDGE' && handle ? (
        <div className="relative flex min-h-7 items-center gap-2 rounded-md border border-dash-border/70 bg-dash-surface/60 px-2 py-1">
          <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{handle}</p>
          <InlineSourceHandle id={handle} title={handle} />
        </div>
      ) : (
        <p className="text-[10px] text-mute">{t('canvas.aiHandoverFallback')}</p>
      )}
    </div>
  )
}

function HandoverBody({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations('dashboard.flows.editor')
  const reason = asString(data.reason).trim()
  return <p className="text-[11px] text-mute">{reason || t('canvas.handoverHint')}</p>
}

function usesInlineHandles(type: FlowCanvasNodeType, data: Record<string, unknown>): boolean {
  if (type === 'INTERACTIVE_BUTTON' || type === 'INTERACTIVE_LIST' || type === 'CONDITION') {
    return true
  }
  if (type === 'AI_RAG' && asString(data.fallbackAction) === 'ROUTE_EDGE') {
    return true
  }
  return false
}

function FlowTypedNode({
  type,
  typeLabel,
  props,
}: {
  type: FlowCanvasNodeType
  typeLabel: string
  props: NodeProps<FlowRfNode>
}) {
  const t = useTranslations('dashboard.flows.editor')
  const { readOnly, deleteNode } = useFlowEditor()
  const data = props.data ?? {}
  const handles = sourceHandlesForNode(type, data)
  const inline = usesInlineHandles(type, data)
  const nodeId = props.id

  let body: ReactNode = null
  switch (type) {
    case 'TRIGGER':
      body = <TriggerBody />
      break
    case 'MESSAGE':
      body = <MessageBody nodeId={nodeId} data={data} />
      break
    case 'TEMPLATE':
      body = <TemplateBody data={data} />
      break
    case 'INTERACTIVE_BUTTON':
      body = <ButtonsBody nodeId={nodeId} data={data} />
      break
    case 'INTERACTIVE_LIST':
      body = <ListBody nodeId={nodeId} data={data} />
      break
    case 'CONDITION':
      body = <ConditionBody data={data} />
      break
    case 'SUBFLOW':
      body = <SubflowBody data={data} />
      break
    case 'AI_RAG':
      body = <AiRagBody data={data} />
      break
    case 'HUMAN_HANDOVER':
      body = <HandoverBody data={data} />
      break
    case 'EXIT':
      body = <p className="text-[11px] text-mute">{t('canvas.exitHint')}</p>
      break
  }

  return (
    <FlowNodeFrame
      type={type}
      typeLabel={typeLabel}
      label={nodeLabel(data, typeLabel)}
      selected={Boolean(props.selected)}
      showTarget={type !== 'TRIGGER'}
      handles={handles}
      handleLayout={inline ? 'inline' : 'distributed'}
      headerAction={
        type !== 'TRIGGER' && !readOnly ? (
          <button
            type="button"
            className="nodrag nopan rounded p-0.5 text-current/70 hover:text-current"
            aria-label={t('deleteNode')}
            onClick={(event) => {
              event.stopPropagation()
              deleteNode(nodeId)
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : undefined
      }
    >
      {body}
    </FlowNodeFrame>
  )
}

function memoNode(type: FlowCanvasNodeType, typeLabel: string) {
  const Component = memo(function NamedNode(props: NodeProps<FlowRfNode>) {
    return <FlowTypedNode type={type} typeLabel={typeLabel} props={props} />
  })
  Component.displayName = `${type}Node`
  return Component
}

export const TriggerNode = memoNode('TRIGGER', 'Trigger')
export const MessageNode = memoNode('MESSAGE', 'Message')
export const TemplateNode = memoNode('TEMPLATE', 'Template')
export const InteractiveButtonNode = memoNode('INTERACTIVE_BUTTON', 'Buttons')
export const InteractiveListNode = memoNode('INTERACTIVE_LIST', 'List')
export const ConditionNode = memoNode('CONDITION', 'Condition')
export const SubflowNode = memoNode('SUBFLOW', 'Subflow')
export const AiRagNode = memoNode('AI_RAG', 'AI RAG')
export const HumanHandoverNode = memoNode('HUMAN_HANDOVER', 'Handover')
export const ExitNode = memoNode('EXIT', 'Exit')

export const flowNodeTypes = {
  TRIGGER: TriggerNode,
  MESSAGE: MessageNode,
  TEMPLATE: TemplateNode,
  INTERACTIVE_BUTTON: InteractiveButtonNode,
  INTERACTIVE_LIST: InteractiveListNode,
  CONDITION: ConditionNode,
  SUBFLOW: SubflowNode,
  AI_RAG: AiRagNode,
  HUMAN_HANDOVER: HumanHandoverNode,
  EXIT: ExitNode,
}
