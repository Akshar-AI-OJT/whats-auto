'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CONDITION_OPERATORS,
  FLOW_NAV_ACTIONS,
  META_INTERACTIVE_LIMITS,
  asRecord,
  asString,
  countListRows,
  newCanvasId,
  type FlowNavAction,
  type FlowRfNode,
} from './flow-canvas-graph'

const selectClassName = cn(
  'h-11 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const textareaClassName = cn(
  'min-h-24 w-full rounded-xl border border-dash-border bg-canvas px-3 py-2 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

type TemplateOption = { id: string; name: string }
type FlowOption = { id: string; name: string }

export function FlowNodeInspector({
  node,
  readOnly,
  templates,
  publishedFlows,
  onPatchData,
  onRenameHandle,
  onDelete,
}: {
  node: FlowRfNode | null
  readOnly: boolean
  templates: TemplateOption[]
  publishedFlows: FlowOption[]
  onPatchData: (patch: Record<string, unknown>) => void
  onRenameHandle: (oldId: string, nextId: string) => void
  onDelete: () => void
}) {
  const t = useTranslations('dashboard.flows.editor')

  if (!node) {
    return (
      <div className="rounded-xl border border-dash-border bg-canvas p-4">
        <p className="text-sm text-mute">{t('inspectorEmpty')}</p>
      </div>
    )
  }

  const type = node.type ?? 'MESSAGE'
  const data = node.data ?? {}
  const canDelete = type !== 'TRIGGER' && !readOnly

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-dash-border bg-canvas p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
      <p className="text-xs font-medium tracking-wide text-mute uppercase">
            {t(`nodeTypes.${type}`)}
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{node.id}</p>
        </div>
        {canDelete ? (
          <Button type="button" size="sm" variant="outline" onClick={onDelete}>
            {t('deleteNode')}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t('fields.label')}</Label>
        <Input
          value={asString(data.label)}
          disabled={readOnly}
          onChange={(event) => onPatchData({ label: event.target.value })}
          className="h-11 rounded-xl"
        />
      </div>

      {type === 'TRIGGER' ? (
        <p className="mt-4 text-xs text-mute">{t('triggerMirrorHint')}</p>
      ) : null}

      {type === 'MESSAGE' ? (
        <MessageFields data={data} readOnly={readOnly} onPatchData={onPatchData} />
      ) : null}
      {type === 'TEMPLATE' ? (
        <TemplateFields
          data={data}
          readOnly={readOnly}
          templates={templates}
          onPatchData={onPatchData}
        />
      ) : null}
      {type === 'INTERACTIVE_BUTTON' ? (
        <ButtonFields
          data={data}
          readOnly={readOnly}
          onPatchData={onPatchData}
          onRenameHandle={onRenameHandle}
        />
      ) : null}
      {type === 'INTERACTIVE_LIST' ? (
        <ListFields
          data={data}
          readOnly={readOnly}
          onPatchData={onPatchData}
          onRenameHandle={onRenameHandle}
        />
      ) : null}
      {type === 'CONDITION' ? (
        <ConditionFields
          data={data}
          readOnly={readOnly}
          onPatchData={onPatchData}
          onRenameHandle={onRenameHandle}
        />
      ) : null}
      {type === 'SUBFLOW' ? (
        <SubflowFields
          data={data}
          readOnly={readOnly}
          publishedFlows={publishedFlows}
          onPatchData={onPatchData}
        />
      ) : null}
      {type === 'AI_RAG' ? (
        <AiRagFields
          data={data}
          readOnly={readOnly}
          onPatchData={onPatchData}
          onRenameHandle={onRenameHandle}
        />
      ) : null}
      {type === 'HUMAN_HANDOVER' ? (
        <div className="mt-4 space-y-2">
          <Label>{t('fields.reason')}</Label>
          <Input
            value={asString(data.reason)}
            disabled={readOnly}
            onChange={(event) => onPatchData({ reason: event.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
      ) : null}
    </div>
  )
}

function MessageFields({
  data,
  readOnly,
  onPatchData,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  onPatchData: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  const messageType = asString(data.messageType) || 'text'

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label>{t('fields.messageType')}</Label>
        <select
          className={selectClassName}
          value={messageType}
          disabled={readOnly}
          onChange={(event) => onPatchData({ messageType: event.target.value })}
        >
          {(['text', 'image', 'video', 'document'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`messageTypes.${value}`)}
            </option>
          ))}
        </select>
      </div>
      {messageType === 'text' ? (
        <div className="space-y-2">
          <Label>{t('fields.text')}</Label>
          <textarea
            className={textareaClassName}
            value={asString(data.text)}
            disabled={readOnly}
            onChange={(event) => onPatchData({ text: event.target.value })}
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>{t('fields.mediaAssetId')}</Label>
            <Input
              value={asString(data.mediaAssetId)}
              disabled={readOnly}
              onChange={(event) => onPatchData({ mediaAssetId: event.target.value })}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('fields.caption')}</Label>
            <Input
              value={asString(data.caption)}
              disabled={readOnly}
              onChange={(event) => onPatchData({ caption: event.target.value })}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={Boolean(data.waitForResponse)}
          disabled={readOnly}
          onChange={(event) => onPatchData({ waitForResponse: event.target.checked })}
        />
        {t('fields.waitForResponse')}
      </label>
    </div>
  )
}

function TemplateFields({
  data,
  readOnly,
  templates,
  onPatchData,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  templates: TemplateOption[]
  onPatchData: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  return (
    <div className="mt-4 space-y-2">
      <Label>{t('fields.template')}</Label>
      <select
        className={selectClassName}
        value={asString(data.messageTemplateId)}
        disabled={readOnly}
        onChange={(event) => onPatchData({ messageTemplateId: event.target.value })}
      >
        <option value="">{t('fields.templatePlaceholder')}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function ButtonFields({
  data,
  readOnly,
  onPatchData,
  onRenameHandle,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  onPatchData: (patch: Record<string, unknown>) => void
  onRenameHandle: (oldId: string, nextId: string) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  const bodyText = asString(data.bodyText)
  const buttons = Array.isArray(data.buttons) ? data.buttons.map(asRecord) : []

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label>{t('fields.bodyText')}</Label>
        <textarea
          className={textareaClassName}
          value={bodyText}
          disabled={readOnly}
          onChange={(event) => onPatchData({ bodyText: event.target.value })}
        />
      </div>
      <p className="text-xs text-mute">
        {t('meta.buttons', { count: buttons.length, max: META_INTERACTIVE_LIMITS.maxButtons })}
      </p>
      {buttons.map((button, index) => {
        const id = asString(button.id)
        const title = asString(button.title)
        return (
          <div key={`${id}-${index}`} className="space-y-2 rounded-lg border border-dash-border p-3">
            <div className="space-y-2">
              <Label>{t('fields.handleId')}</Label>
              <Input
                value={id}
                disabled={readOnly}
                onChange={(event) => {
                  const nextId = event.target.value
                  const next = buttons.map((item, i) =>
                    i === index ? { ...item, id: nextId } : item
                  )
                  onPatchData({ buttons: next })
                  onRenameHandle(id, nextId)
                }}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {t('fields.buttonTitle')} ({title.length}/{META_INTERACTIVE_LIMITS.buttonTitleMax})
              </Label>
              <Input
                value={title}
                maxLength={META_INTERACTIVE_LIMITS.buttonTitleMax}
                disabled={readOnly}
                onChange={(event) => {
                  const next = buttons.map((item, i) =>
                    i === index ? { ...item, title: event.target.value } : item
                  )
                  onPatchData({ buttons: next })
                }}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('fields.actionType')}</Label>
              <select
                className={selectClassName}
                value={(asString(button.actionType) || 'DEFAULT') as FlowNavAction}
                disabled={readOnly}
                onChange={(event) => {
                  const next = buttons.map((item, i) =>
                    i === index ? { ...item, actionType: event.target.value } : item
                  )
                  onPatchData({ buttons: next })
                }}
              >
                {FLOW_NAV_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {t(`navActions.${action}`)}
                  </option>
                ))}
              </select>
            </div>
            {!readOnly && buttons.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPatchData({ buttons: buttons.filter((_, i) => i !== index) })}
              >
                {t('removeButton')}
              </Button>
            ) : null}
          </div>
        )
      })}
      {!readOnly && buttons.length < META_INTERACTIVE_LIMITS.maxButtons ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onPatchData({
              buttons: [
                ...buttons,
                { id: newCanvasId('btn'), title: 'OK', actionType: 'DEFAULT' },
              ],
            })
          }
        >
          {t('addButton')}
        </Button>
      ) : null}
    </div>
  )
}

function ListFields({
  data,
  readOnly,
  onPatchData,
  onRenameHandle,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  onPatchData: (patch: Record<string, unknown>) => void
  onRenameHandle: (oldId: string, nextId: string) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  const sections = Array.isArray(data.sections) ? data.sections.map(asRecord) : []
  const rowCount = countListRows(data)
  const buttonTitle = asString(data.buttonTitle)

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label>{t('fields.bodyText')}</Label>
        <textarea
          className={textareaClassName}
          value={asString(data.bodyText)}
          disabled={readOnly}
          onChange={(event) => onPatchData({ bodyText: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>
          {t('fields.listButtonTitle')} ({buttonTitle.length}/
          {META_INTERACTIVE_LIMITS.listButtonTitleMax})
        </Label>
        <Input
          value={buttonTitle}
          maxLength={META_INTERACTIVE_LIMITS.listButtonTitleMax}
          disabled={readOnly}
          onChange={(event) => onPatchData({ buttonTitle: event.target.value })}
          className="h-11 rounded-xl"
        />
      </div>
      <p className="text-xs text-mute">
        {t('meta.rows', { count: rowCount, max: META_INTERACTIVE_LIMITS.maxListRows })}
      </p>
      {sections.map((section, sectionIndex) => {
        const rows = Array.isArray(section.rows) ? section.rows.map(asRecord) : []
        const sectionTitle = asString(section.title)
        return (
          <div
            key={`section-${sectionIndex}`}
            className="space-y-2 rounded-lg border border-dash-border p-3"
          >
            <div className="space-y-2">
              <Label>
                {t('fields.sectionTitle')} ({sectionTitle.length}/
                {META_INTERACTIVE_LIMITS.sectionTitleMax})
              </Label>
              <Input
                value={sectionTitle}
                maxLength={META_INTERACTIVE_LIMITS.sectionTitleMax}
                disabled={readOnly}
                onChange={(event) => {
                  const next = sections.map((item, i) =>
                    i === sectionIndex ? { ...item, title: event.target.value } : item
                  )
                  onPatchData({ sections: next })
                }}
                className="h-11 rounded-xl"
              />
            </div>
            {rows.map((row, rowIndex) => {
              const id = asString(row.id)
              const title = asString(row.title)
              const description = asString(row.description)
              return (
                <div
                  key={`${id}-${rowIndex}`}
                  className="space-y-2 rounded-md border border-dash-border/70 p-2"
                >
                  <Input
                    value={id}
                    disabled={readOnly}
                    placeholder={t('fields.handleId')}
                    onChange={(event) => {
                      const nextId = event.target.value
                      const next = sections.map((item, i) => {
                        if (i !== sectionIndex) return item
                        const nextRows = rows.map((r, ri) =>
                          ri === rowIndex ? { ...r, id: nextId } : r
                        )
                        return { ...item, rows: nextRows }
                      })
                      onPatchData({ sections: next })
                      onRenameHandle(id, nextId)
                    }}
                    className="h-10 rounded-xl"
                  />
                  <Input
                    value={title}
                    maxLength={META_INTERACTIVE_LIMITS.rowTitleMax}
                    disabled={readOnly}
                    placeholder={`${t('fields.rowTitle')} (${title.length}/${META_INTERACTIVE_LIMITS.rowTitleMax})`}
                    onChange={(event) => {
                      const next = sections.map((item, i) => {
                        if (i !== sectionIndex) return item
                        const nextRows = rows.map((r, ri) =>
                          ri === rowIndex ? { ...r, title: event.target.value } : r
                        )
                        return { ...item, rows: nextRows }
                      })
                      onPatchData({ sections: next })
                    }}
                    className="h-10 rounded-xl"
                  />
                  <Input
                    value={description}
                    maxLength={META_INTERACTIVE_LIMITS.rowDescriptionMax}
                    disabled={readOnly}
                    placeholder={`${t('fields.rowDescription')} (${description.length}/${META_INTERACTIVE_LIMITS.rowDescriptionMax})`}
                    onChange={(event) => {
                      const next = sections.map((item, i) => {
                        if (i !== sectionIndex) return item
                        const nextRows = rows.map((r, ri) =>
                          ri === rowIndex ? { ...r, description: event.target.value } : r
                        )
                        return { ...item, rows: nextRows }
                      })
                      onPatchData({ sections: next })
                    }}
                    className="h-10 rounded-xl"
                  />
                  <select
                    className={selectClassName}
                    value={(asString(row.actionType) || 'DEFAULT') as FlowNavAction}
                    disabled={readOnly}
                    onChange={(event) => {
                      const next = sections.map((item, i) => {
                        if (i !== sectionIndex) return item
                        const nextRows = rows.map((r, ri) =>
                          ri === rowIndex ? { ...r, actionType: event.target.value } : r
                        )
                        return { ...item, rows: nextRows }
                      })
                      onPatchData({ sections: next })
                    }}
                  >
                    {FLOW_NAV_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {t(`navActions.${action}`)}
                      </option>
                    ))}
                  </select>
                  {!readOnly && rowCount > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = sections.map((item, i) => {
                          if (i !== sectionIndex) return item
                          return { ...item, rows: rows.filter((_, ri) => ri !== rowIndex) }
                        })
                        onPatchData({ sections: next })
                      }}
                    >
                      {t('removeRow')}
                    </Button>
                  ) : null}
                </div>
              )
            })}
            {!readOnly && rowCount < META_INTERACTIVE_LIMITS.maxListRows ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = sections.map((item, i) => {
                    if (i !== sectionIndex) return item
                    return {
                      ...item,
                      rows: [
                        ...rows,
                        { id: newCanvasId('row'), title: 'Option', actionType: 'DEFAULT' },
                      ],
                    }
                  })
                  onPatchData({ sections: next })
                }}
              >
                {t('addRow')}
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ConditionFields({
  data,
  readOnly,
  onPatchData,
  onRenameHandle,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  onPatchData: (patch: Record<string, unknown>) => void
  onRenameHandle: (oldId: string, nextId: string) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  const conditions = Array.isArray(data.conditions) ? data.conditions.map(asRecord) : []
  const fallbackHandle = asString(data.fallbackHandle) || 'else'

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label>{t('fields.fallbackHandle')}</Label>
        <Input
          value={fallbackHandle}
          disabled={readOnly}
          onChange={(event) => {
            const next = event.target.value
            onPatchData({ fallbackHandle: next })
            onRenameHandle(fallbackHandle, next)
          }}
          className="h-11 rounded-xl"
        />
      </div>
      {conditions.map((condition, index) => {
        const id = asString(condition.id)
        return (
          <div key={`${id}-${index}`} className="space-y-2 rounded-lg border border-dash-border p-3">
            <Input
              value={id}
              disabled={readOnly}
              placeholder={t('fields.handleId')}
              onChange={(event) => {
                const nextId = event.target.value
                const next = conditions.map((item, i) =>
                  i === index ? { ...item, id: nextId } : item
                )
                onPatchData({ conditions: next })
                onRenameHandle(id, nextId)
              }}
              className="h-10 rounded-xl"
            />
            <Input
              value={asString(condition.variableKey)}
              disabled={readOnly}
              placeholder={t('fields.variableKey')}
              onChange={(event) => {
                const next = conditions.map((item, i) =>
                  i === index ? { ...item, variableKey: event.target.value } : item
                )
                onPatchData({ conditions: next })
              }}
              className="h-10 rounded-xl"
            />
            <select
              className={selectClassName}
              value={asString(condition.operator) || 'equals'}
              disabled={readOnly}
              onChange={(event) => {
                const next = conditions.map((item, i) =>
                  i === index ? { ...item, operator: event.target.value } : item
                )
                onPatchData({ conditions: next })
              }}
            >
              {CONDITION_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
            <Input
              value={asString(condition.value)}
              disabled={readOnly}
              placeholder={t('fields.value')}
              onChange={(event) => {
                const next = conditions.map((item, i) =>
                  i === index ? { ...item, value: event.target.value } : item
                )
                onPatchData({ conditions: next })
              }}
              className="h-10 rounded-xl"
            />
            {!readOnly && conditions.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onPatchData({ conditions: conditions.filter((_, i) => i !== index) })
                }
              >
                {t('removeCondition')}
              </Button>
            ) : null}
          </div>
        )
      })}
      {!readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onPatchData({
              conditions: [
                ...conditions,
                {
                  id: newCanvasId('if'),
                  operator: 'equals',
                  variableKey: 'variables.slot',
                  value: '',
                },
              ],
            })
          }
        >
          {t('addCondition')}
        </Button>
      ) : null}
    </div>
  )
}

function SubflowFields({
  data,
  readOnly,
  publishedFlows,
  onPatchData,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  publishedFlows: FlowOption[]
  onPatchData: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  return (
    <div className="mt-4 space-y-2">
      <Label>{t('fields.subflow')}</Label>
      <select
        className={selectClassName}
        value={asString(data.subflowId)}
        disabled={readOnly}
        onChange={(event) => onPatchData({ subflowId: event.target.value })}
      >
        <option value="">{t('fields.subflowPlaceholder')}</option>
        {publishedFlows.map((flow) => (
          <option key={flow.id} value={flow.id}>
            {flow.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function AiRagFields({
  data,
  readOnly,
  onPatchData,
  onRenameHandle,
}: {
  data: Record<string, unknown>
  readOnly: boolean
  onPatchData: (patch: Record<string, unknown>) => void
  onRenameHandle: (oldId: string, nextId: string) => void
}) {
  const t = useTranslations('dashboard.flows.editor')
  const fallbackAction = asString(data.fallbackAction) || 'HUMAN_HANDOVER'
  const fallbackTargetHandle = asString(data.fallbackTargetHandle)

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label>{t('fields.fallbackAction')}</Label>
        <select
          className={selectClassName}
          value={fallbackAction}
          disabled={readOnly}
          onChange={(event) => onPatchData({ fallbackAction: event.target.value })}
        >
          <option value="HUMAN_HANDOVER">{t('aiFallbacks.HUMAN_HANDOVER')}</option>
          <option value="ROUTE_EDGE">{t('aiFallbacks.ROUTE_EDGE')}</option>
        </select>
      </div>
      {fallbackAction === 'ROUTE_EDGE' ? (
        <div className="space-y-2">
          <Label>{t('fields.fallbackTargetHandle')}</Label>
          <Input
            value={fallbackTargetHandle}
            disabled={readOnly}
            onChange={(event) => {
              const next = event.target.value
              onPatchData({ fallbackTargetHandle: next })
              onRenameHandle(fallbackTargetHandle, next)
            }}
            className="h-11 rounded-xl"
          />
        </div>
      ) : null}
    </div>
  )
}
