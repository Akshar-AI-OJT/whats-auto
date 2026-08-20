'use client'

import { Check, CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CAMPAIGN_CONTACT_MAPPING_FIELDS,
  emptyMappingDraft,
  isMappingDraftComplete,
  type CampaignVariableMappingDraft,
  type CampaignVariableMappingDrafts,
  type CampaignVariableMappingSource,
} from './campaign-variable-mappings'

const selectClassName = cn(
  'h-11 w-full rounded-md border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type CampaignVariableMappingsSectionProps = {
  variableNames: string[]
  drafts: CampaignVariableMappingDrafts
  unsupportedReason: string | null
  disabled?: boolean
  onChange: (variable: string, next: CampaignVariableMappingDraft) => void
}

export function CampaignVariableMappingsSection({
  variableNames,
  drafts,
  unsupportedReason,
  disabled = false,
  onChange,
}: CampaignVariableMappingsSectionProps) {
  const t = useTranslations('dashboard.campaigns.form.variableMappings')

  if (variableNames.length === 0 && !unsupportedReason) {
    return null
  }

  const mappedCount = variableNames.filter((name) =>
    isMappingDraftComplete(drafts[name])
  ).length
  const unmappedCount = variableNames.length - mappedCount

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-ink">{t('title')}</legend>
      <p className="text-xs text-mute">{t('hint')}</p>

      {unsupportedReason ? (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-negative/25 bg-negative/5 px-3 py-2.5 text-sm text-negative"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{t('notSendable')}</p>
            <p className="text-negative/90">{unsupportedReason}</p>
          </div>
        </div>
      ) : null}

      {variableNames.length > 0 ? (
        <>
          <p className="text-xs font-medium text-body">
            {unmappedCount > 0
              ? t('progressIncomplete', { mapped: mappedCount, total: variableNames.length })
              : t('progressComplete', { total: variableNames.length })}
          </p>

          <ul className="space-y-3">
            {variableNames.map((variable) => {
              const draft = drafts[variable] ?? emptyMappingDraft()
              const complete = isMappingDraftComplete(draft)

              return (
                <li
                  key={variable}
                  className={cn(
                    'rounded-xl border px-3 py-3 sm:px-4',
                    complete
                      ? 'border-positive/30 bg-positive/5'
                      : 'border-dash-border bg-dash-surface/40'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-ink">
                      {`{{${variable}}}`}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
                        complete
                          ? 'bg-positive/15 text-positive-deep'
                          : 'bg-canvas text-mute'
                      )}
                    >
                      {complete ? (
                        <>
                          <Check className="size-3" aria-hidden />
                          {t('statusMapped')}
                        </>
                      ) : (
                        t('statusUnmapped')
                      )}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`campaign-var-source-${variable}`}
                        className="text-xs font-medium text-body"
                      >
                        {t('source')}
                      </label>
                      <select
                        id={`campaign-var-source-${variable}`}
                        className={selectClassName}
                        value={draft.source}
                        disabled={disabled}
                        onChange={(e) => {
                          const source = e.target.value as CampaignVariableMappingSource | ''
                          onChange(variable, {
                            source,
                            field:
                              source === 'contact_field'
                                ? 'name'
                                : source === 'custom_field'
                                  ? draft.field
                                  : '',
                            value: source === 'static' ? draft.value : '',
                          })
                        }}
                      >
                        <option value="">{t('sourcePlaceholder')}</option>
                        <option value="contact_field">{t('sources.contact_field')}</option>
                        <option value="custom_field">{t('sources.custom_field')}</option>
                        <option value="static">{t('sources.static')}</option>
                      </select>
                    </div>

                    {draft.source === 'contact_field' ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`campaign-var-field-${variable}`}
                          className="text-xs font-medium text-body"
                        >
                          {t('contactField')}
                        </label>
                        <select
                          id={`campaign-var-field-${variable}`}
                          className={selectClassName}
                          value={draft.field}
                          disabled={disabled}
                          onChange={(e) =>
                            onChange(variable, { ...draft, field: e.target.value })
                          }
                        >
                          {CAMPAIGN_CONTACT_MAPPING_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {t(`contactFields.${field}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {draft.source === 'custom_field' ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`campaign-var-custom-${variable}`}
                          className="text-xs font-medium text-body"
                        >
                          {t('customField')}
                        </label>
                        <Input
                          id={`campaign-var-custom-${variable}`}
                          value={draft.field}
                          disabled={disabled}
                          placeholder={t('customFieldPlaceholder')}
                          onChange={(e) =>
                            onChange(variable, { ...draft, field: e.target.value })
                          }
                        />
                      </div>
                    ) : null}

                    {draft.source === 'static' ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`campaign-var-static-${variable}`}
                          className="text-xs font-medium text-body"
                        >
                          {t('staticValue')}
                        </label>
                        <Input
                          id={`campaign-var-static-${variable}`}
                          value={draft.value}
                          disabled={disabled}
                          placeholder={t('staticValuePlaceholder')}
                          onChange={(e) =>
                            onChange(variable, { ...draft, value: e.target.value })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </fieldset>
  )
}
