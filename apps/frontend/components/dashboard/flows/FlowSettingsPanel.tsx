'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type {
  ConversationFlowExpiryMode,
  ConversationFlowKeywordMatchType,
  ConversationFlowSettings,
  ConversationFlowTangentResume,
  ConversationFlowTriggerType,
} from '@/lib/api'
import { FLOW_HANDOVER_KEYWORD_LIMITS } from './flow-canvas-graph'

const selectClassName = cn(
  'h-11 w-full cursor-pointer rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const textareaClassName = cn(
  'min-h-20 w-full rounded-xl border border-dash-border bg-canvas px-3 py-2 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

function normalizeHandoverKeyword(raw: string): string | null {
  const keyword = raw.trim().slice(0, FLOW_HANDOVER_KEYWORD_LIMITS.maxLength)
  return keyword.length > 0 ? keyword : null
}

export function FlowSettingsPanel({
  description,
  triggerType,
  keywords,
  matchType,
  settings,
  readOnly,
  onDescriptionChange,
  onTriggerTypeChange,
  onKeywordsChange,
  onMatchTypeChange,
  onSettingsChange,
}: {
  description: string
  triggerType: ConversationFlowTriggerType
  keywords: string
  matchType: ConversationFlowKeywordMatchType
  settings: ConversationFlowSettings
  readOnly: boolean
  onDescriptionChange: (value: string) => void
  onTriggerTypeChange: (value: ConversationFlowTriggerType) => void
  onKeywordsChange: (value: string) => void
  onMatchTypeChange: (value: ConversationFlowKeywordMatchType) => void
  onSettingsChange: (patch: Partial<ConversationFlowSettings>) => void
}) {
  const t = useTranslations('dashboard.flows')
  const [handoverDraft, setHandoverDraft] = useState('')

  const addHandoverKeyword = (raw: string) => {
    const keyword = normalizeHandoverKeyword(raw)
    if (!keyword || readOnly) return
    const existing = settings.handoverKeywords
    if (existing.length >= FLOW_HANDOVER_KEYWORD_LIMITS.maxCount) return
    if (existing.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
      setHandoverDraft('')
      return
    }
    onSettingsChange({ handoverKeywords: [...existing, keyword] })
    setHandoverDraft('')
  }

  const removeHandoverKeyword = (index: number) => {
    if (readOnly) return
    onSettingsChange({
      handoverKeywords: settings.handoverKeywords.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-ink">{t('editor.settingsTitle')}</p>
        <p className="mt-1 text-xs text-mute">{t('editor.settingsHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="flow-description">{t('create.description')}</Label>
        <textarea
          id="flow-description"
          className={textareaClassName}
          value={description}
          disabled={readOnly}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={t('create.descriptionPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="flow-trigger">{t('create.triggerType')}</Label>
        <select
          id="flow-trigger"
          className={selectClassName}
          value={triggerType}
          disabled={readOnly}
          onChange={(event) =>
            onTriggerTypeChange(event.target.value as ConversationFlowTriggerType)
          }
        >
          {(['KEYWORD', 'INBOUND_ANY', 'CAMPAIGN_REPLY', 'SUBFLOW_ENTRY'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`triggerType.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {triggerType === 'KEYWORD' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="flow-keywords">{t('create.keywords')}</Label>
            <Input
              id="flow-keywords"
              value={keywords}
              disabled={readOnly}
              onChange={(event) => onKeywordsChange(event.target.value)}
              placeholder={t('create.keywordsPlaceholder')}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flow-match">{t('editor.matchType')}</Label>
            <select
              id="flow-match"
              className={selectClassName}
              value={matchType}
              disabled={readOnly}
              onChange={(event) =>
                onMatchTypeChange(event.target.value as ConversationFlowKeywordMatchType)
              }
            >
              {(['exact', 'contains', 'regex'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`editor.matchTypes.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="flow-ttl">{t('editor.sessionTtl')}</Label>
        <Input
          id="flow-ttl"
          type="number"
          min={1}
          max={10080}
          value={settings.sessionTtlMinutes}
          disabled={readOnly}
          onChange={(event) =>
            onSettingsChange({ sessionTtlMinutes: Number(event.target.value) || 1 })
          }
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="flow-expiry">{t('editor.onExpiry')}</Label>
        <select
          id="flow-expiry"
          className={selectClassName}
          value={settings.onExpiry}
          disabled={readOnly}
          onChange={(event) =>
            onSettingsChange({ onExpiry: event.target.value as ConversationFlowExpiryMode })
          }
        >
          {(['RESUME_PROMPT', 'RESTART', 'RESUME_SILENT'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`editor.expiryModes.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="flow-tangent">{t('editor.tangentResume')}</Label>
        <select
          id="flow-tangent"
          className={selectClassName}
          value={settings.tangentResume}
          disabled={readOnly}
          onChange={(event) =>
            onSettingsChange({
              tangentResume: event.target.value as ConversationFlowTangentResume,
            })
          }
        >
          {(['IMMEDIATE_REPROMPT', 'WAIT_FOR_NEXT'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`editor.tangentModes.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="flow-handover-keywords">{t('editor.handoverKeywords')}</Label>
        <p className="text-xs text-mute">{t('editor.handoverKeywordsHint')}</p>
        <div className="overflow-hidden rounded-xl border border-dash-border bg-canvas">
          <div className="flex min-h-11 flex-wrap gap-2 border-b border-dash-border bg-dash-surface/40 px-3 py-2">
            {settings.handoverKeywords.length === 0 ? (
              <p className="py-1 text-xs text-mute">{t('editor.handoverKeywordsEmpty')}</p>
            ) : (
              settings.handoverKeywords.map((keyword, index) => (
                <span
                  key={`${keyword}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-dash-border"
                >
                  {keyword}
                  <button
                    type="button"
                    className="rounded text-mute hover:text-ink disabled:opacity-60"
                    aria-label={t('editor.removeHandoverKeyword', { keyword })}
                    disabled={readOnly}
                    onClick={() => removeHandoverKeyword(index)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))
            )}
          </div>
          <input
            id="flow-handover-keywords"
            className="h-11 w-full border-0 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-mute disabled:cursor-not-allowed disabled:opacity-60"
            disabled={readOnly}
            value={handoverDraft}
            placeholder={t('editor.handoverKeywordsPlaceholder')}
            onChange={(event) => setHandoverDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                addHandoverKeyword(handoverDraft)
              }
              if (event.key === 'Backspace' && !handoverDraft) {
                removeHandoverKeyword(settings.handoverKeywords.length - 1)
              }
            }}
            onBlur={() => {
              if (handoverDraft.trim()) addHandoverKeyword(handoverDraft)
            }}
          />
        </div>
      </div>
    </div>
  )
}
