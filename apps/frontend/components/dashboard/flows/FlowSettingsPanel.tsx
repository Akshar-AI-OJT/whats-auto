'use client'

import { useTranslations } from 'next-intl'
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

const selectClassName = cn(
  'h-11 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const textareaClassName = cn(
  'min-h-20 w-full rounded-xl border border-dash-border bg-canvas px-3 py-2 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

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
    </div>
  )
}
