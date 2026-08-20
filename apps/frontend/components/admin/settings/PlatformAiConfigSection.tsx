'use client'

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, X } from 'lucide-react'
import {
  api,
  type ApiError,
  type PlatformAiConfig,
  type UpdatePlatformAiConfigBody,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import {
  PLATFORM_AI_LIMITS,
  PLATFORM_AI_PROVIDERS,
  catalogForProvider,
  selectOptionsWithCurrent,
} from './platform-ai-models'

const fieldClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const textareaClassName = cn(
  fieldClassName,
  'h-auto min-h-80 resize-y px-4 py-3.5 font-mono text-[13px] leading-6'
)

type FormState = {
  isEnabled: boolean
  chatProvider: string
  chatModel: string
  summaryModel: string | null
  embeddingModel: string
  temperature: string
  maxOutputTokens: number
  campaignAttributionWindowHours: string
  minConfidenceScore: string
  debounceDelaySeconds: string
  workingSetSize: string
  summaryTurnThreshold: string
  systemPrompt: string
  handoverKeywords: string[]
}

function unwrapConfig(payload: unknown): PlatformAiConfig | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: PlatformAiConfig } & Partial<PlatformAiConfig>
  if (root.data && typeof root.data === 'object') {
    const chatModel = root.data.chatModel || root.data.modelName
    if (typeof chatModel === 'string') return { ...root.data, chatModel, modelName: chatModel }
  }
  const chatModel = root.chatModel || root.modelName
  if (typeof chatModel === 'string' && typeof root.embeddingModel === 'string') {
    return { ...(root as PlatformAiConfig), chatModel, modelName: chatModel }
  }
  return null
}

function reindexStatusFromConfig(config: PlatformAiConfig): 'idle' | 'running' | 'failed' {
  return config.reindexStatus === 'running' || config.reindexStatus === 'failed'
    ? config.reindexStatus
    : 'idle'
}

function formFromConfig(config: PlatformAiConfig): FormState {
  const pendingEmbed =
    (config.reindexStatus === 'running' || config.reindexStatus === 'failed') &&
    config.reindexEmbeddingModel
  return {
    isEnabled: config.isEnabled,
    chatProvider: config.chatProvider || 'openai',
    chatModel: config.chatModel || config.modelName,
    summaryModel: config.summaryModel ?? null,
    embeddingModel: pendingEmbed || config.embeddingModel,
    temperature: String(config.temperature),
    maxOutputTokens: Number(config.maxOutputTokens ?? 1024),
    campaignAttributionWindowHours: String(config.campaignAttributionWindowHours),
    minConfidenceScore: String(config.minConfidenceScore),
    debounceDelaySeconds: String(config.debounceDelaySeconds),
    workingSetSize: String(config.workingSetSize),
    summaryTurnThreshold: String(config.summaryTurnThreshold),
    systemPrompt: config.systemPrompt ?? '',
    handoverKeywords: [...config.handoverKeywords],
  }
}

function parseBoundedNumber(
  raw: string,
  min: number,
  max: number,
  integer: boolean
): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (integer && !Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

function normalizeKeyword(raw: string): string | null {
  const keyword = raw.trim()
  if (!keyword) return null
  if (keyword.length > PLATFORM_AI_LIMITS.keywordMaxLength) return null
  return keyword
}

function mapAiConfigError(error: unknown, fallback: 'load' | 'save'): string {
  const apiError = error as ApiError
  if (apiError.status === 401) return 'sessionExpired'
  if (
    apiError.status === 403 ||
    apiError.code === 'PERMISSION_DENIED' ||
    apiError.code === 'PLATFORM_ACCESS_DENIED'
  ) {
    return 'permissionDenied'
  }
  if (apiError.code === 'E_PLATFORM_AI_CONFIG_SUMMARY_THRESHOLD') return 'summaryThreshold'
  if (apiError.code === 'E_PLATFORM_AI_CONFIG_NOT_FOUND') return 'notFound'
  if (apiError.code === 'E_PLATFORM_AI_REINDEX_REQUIRED') return 'reindexRequired'
  if (apiError.code === 'E_PLATFORM_AI_REINDEX_IN_PROGRESS') return 'reindexInProgress'
  if (apiError.code === 'E_PLATFORM_AI_INVALID_MODEL') return 'invalidModel'
  if (apiError.code === 'E_PLATFORM_AI_EMBEDDING_PROVIDER_MISMATCH') return 'providerMismatch'
  return apiError.message ? 'raw' : fallback === 'load' ? 'loadFailed' : 'saveFailed'
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-mute">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function FieldShell({
  id,
  label,
  hint,
  className,
  children,
}: {
  id?: string
  label: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-mute">{hint}</p> : null}
    </div>
  )
}

function NumberField({
  id,
  label,
  hint,
  value,
  disabled,
  min,
  max,
  step,
  onChange,
  className,
}: {
  id: string
  label: string
  hint: string
  value: string
  disabled: boolean
  min: number
  max: number
  step: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        className={fieldClassName}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  )
}

export function PlatformAiConfigSection() {
  const t = useTranslations('admin.settings.ai')
  const formId = useId()
  const { toast, showToast, clearToast } = useDashboardToast()

  const [form, setForm] = useState<FormState | null>(null)
  const [reindexStatus, setReindexStatus] = useState<'idle' | 'running' | 'failed'>('idle')
  const [keywordDraft, setKeywordDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const catalog = useMemo(
    () => catalogForProvider(form?.chatProvider ?? 'openai'),
    [form?.chatProvider]
  )
  const chatModels = useMemo(
    () => selectOptionsWithCurrent(catalog.chat, form?.chatModel ?? ''),
    [catalog.chat, form?.chatModel]
  )
  const embeddingModels = useMemo(
    () => selectOptionsWithCurrent(catalog.embedding, form?.embeddingModel ?? ''),
    [catalog.embedding, form?.embeddingModel]
  )
  const summaryModels = useMemo(
    () => selectOptionsWithCurrent(catalog.chat, form?.summaryModel ?? ''),
    [catalog.chat, form?.summaryModel]
  )

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await api.superAdmin.aiConfig.get()
      const config = unwrapConfig(data)
      if (!config) {
        setForm(null)
        setLoadError(t('errors.loadFailed'))
        return
      }
      setForm(formFromConfig(config))
      setReindexStatus(reindexStatusFromConfig(config))
    } catch (err) {
      setForm(null)
      const key = mapAiConfigError(err, 'load')
      setLoadError(key === 'raw' ? (err as ApiError).message : t(`errors.${key}`))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    const scheduled = Promise.resolve().then(() => {
      if (cancelled) return
      return loadConfig()
    })
    return () => {
      cancelled = true
      void scheduled
    }
  }, [loadConfig])

  const addKeyword = useCallback((raw: string) => {
    const keyword = normalizeKeyword(raw)
    if (!keyword) return
    setForm((prev) => {
      if (!prev) return prev
      if (prev.handoverKeywords.length >= PLATFORM_AI_LIMITS.keywordMaxCount) return prev
      const exists = prev.handoverKeywords.some(
        (item) => item.toLowerCase() === keyword.toLowerCase()
      )
      if (exists) return prev
      return { ...prev, handoverKeywords: [...prev.handoverKeywords, keyword] }
    })
    setKeywordDraft('')
  }, [])

  const removeKeyword = useCallback((index: number) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        handoverKeywords: prev.handoverKeywords.filter((_, i) => i !== index),
      }
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!form || saving) return
    clearToast()

    const temperature = parseBoundedNumber(
      form.temperature,
      PLATFORM_AI_LIMITS.temperature.min,
      PLATFORM_AI_LIMITS.temperature.max,
      false
    )
    const maxOutputTokens = parseBoundedNumber(
      String(form.maxOutputTokens),
      PLATFORM_AI_LIMITS.maxOutputTokens.min,
      PLATFORM_AI_LIMITS.maxOutputTokens.max,
      true
    )
    const campaignAttributionWindowHours = parseBoundedNumber(
      form.campaignAttributionWindowHours,
      PLATFORM_AI_LIMITS.campaignAttributionWindowHours.min,
      PLATFORM_AI_LIMITS.campaignAttributionWindowHours.max,
      true
    )
    const minConfidenceScore = parseBoundedNumber(
      form.minConfidenceScore,
      PLATFORM_AI_LIMITS.minConfidenceScore.min,
      PLATFORM_AI_LIMITS.minConfidenceScore.max,
      false
    )
    const debounceDelaySeconds = parseBoundedNumber(
      form.debounceDelaySeconds,
      PLATFORM_AI_LIMITS.debounceDelaySeconds.min,
      PLATFORM_AI_LIMITS.debounceDelaySeconds.max,
      true
    )
    const workingSetSize = parseBoundedNumber(
      form.workingSetSize,
      PLATFORM_AI_LIMITS.workingSetSize.min,
      PLATFORM_AI_LIMITS.workingSetSize.max,
      true
    )
    const summaryTurnThreshold = parseBoundedNumber(
      form.summaryTurnThreshold,
      PLATFORM_AI_LIMITS.summaryTurnThreshold.min,
      PLATFORM_AI_LIMITS.summaryTurnThreshold.max,
      true
    )

    if (
      temperature == null ||
      maxOutputTokens == null ||
      campaignAttributionWindowHours == null ||
      minConfidenceScore == null ||
      debounceDelaySeconds == null ||
      workingSetSize == null ||
      summaryTurnThreshold == null
    ) {
      showToast(t('errors.invalidRange'), 'error')
      return
    }
    if (summaryTurnThreshold < workingSetSize) {
      showToast(t('errors.summaryThreshold'), 'error')
      return
    }
    if (form.handoverKeywords.length < 1) {
      showToast(t('errors.keywordsRequired'), 'error')
      return
    }

    const body: UpdatePlatformAiConfigBody = {
      isEnabled: form.isEnabled,
      chatProvider: form.chatProvider,
      chatModel: form.chatModel,
      summaryModel: form.summaryModel,
      embeddingProvider: form.chatProvider,
      embeddingModel: form.embeddingModel,
      temperature,
      maxOutputTokens,
      campaignAttributionWindowHours,
      minConfidenceScore,
      debounceDelaySeconds,
      workingSetSize,
      summaryTurnThreshold,
      systemPrompt: form.systemPrompt.trim() ? form.systemPrompt : null,
      handoverKeywords: form.handoverKeywords,
      ...(reindexStatus === 'failed' ? { confirmReindex: true } : {}),
    }

    setSaving(true)
    try {
      const persist = async (payload: UpdatePlatformAiConfigBody) => {
        const { data } = await api.superAdmin.aiConfig.update(payload)
        const config = unwrapConfig(data)
        if (config) {
          setForm(formFromConfig(config))
          setReindexStatus(reindexStatusFromConfig(config))
        }
      }

      try {
        await persist(body)
      } catch (err) {
        const apiError = err as ApiError
        if (apiError.code !== 'E_PLATFORM_AI_REINDEX_REQUIRED') throw err
        const confirmed = window.confirm(
          t('reindexConfirm', { count: apiError.chunkCount ?? 0 })
        )
        if (!confirmed) return
        await persist({ ...body, confirmReindex: true })
      }
      showToast(t('saved'), 'success')
    } catch (err) {
      const key = mapAiConfigError(err, 'save')
      showToast(key === 'raw' ? (err as ApiError).message : t(`errors.${key}`), 'error')
    } finally {
      setSaving(false)
    }
  }, [clearToast, form, reindexStatus, saving, showToast, t])

  const embedLocked = reindexStatus === 'running'

  return (
    <DashboardPanel as="section" className="overflow-hidden p-0">
      {toast ? (
        <div className="border-b border-dash-border px-4 pt-4 sm:px-6 md:px-7">
          <DashboardToast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 px-4 py-8 text-sm text-mute sm:px-6 md:px-7">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </p>
      ) : loadError ? (
        <div className="space-y-3 px-4 py-8 sm:px-6 md:px-7">
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadConfig()}>
            {t('retry')}
          </Button>
        </div>
      ) : form ? (
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          <div className="space-y-10 px-4 py-6 sm:px-6 sm:py-7 md:px-7">
            <SettingsSection title={t('sections.response.title')}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5',
                  form.isEnabled
                    ? 'border-primary/40 bg-primary-pale/50'
                    : 'border-dash-border bg-canvas'
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-dash-border-strong text-primary focus-visible:ring-primary/30"
                  checked={form.isEnabled}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, isEnabled: event.target.checked } : prev))
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {t('fields.isEnabled')}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-mute">
                    {t('hints.isEnabled')}
                  </span>
                </span>
              </label>

              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-3">
                <FieldShell
                  id={`${formId}-provider`}
                  label={t('fields.chatProvider')}
                  hint={t('hints.chatProvider')}
                >
                  <select
                    id={`${formId}-provider`}
                    className={fieldClassName}
                    disabled={saving || embedLocked}
                    value={form.chatProvider}
                    onChange={(event) => {
                      const nextProvider = event.target.value
                      const nextCatalog = catalogForProvider(nextProvider)
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              chatProvider: nextProvider,
                              chatModel: nextCatalog.defaults.chatModel,
                              summaryModel: nextCatalog.defaults.summaryModel,
                              embeddingModel: nextCatalog.defaults.embeddingModel,
                            }
                          : prev
                      )
                    }}
                  >
                    {PLATFORM_AI_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {t(`providers.${provider}`)}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <FieldShell
                  id={`${formId}-chat-model`}
                  label={t('fields.chatModel')}
                  hint={t('hints.chatModel')}
                >
                  <select
                    id={`${formId}-chat-model`}
                    className={fieldClassName}
                    disabled={saving}
                    value={form.chatModel}
                    onChange={(event) =>
                      setForm((prev) => (prev ? { ...prev, chatModel: event.target.value } : prev))
                    }
                  >
                    {chatModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <FieldShell
                  id={`${formId}-summary-model`}
                  label={t('fields.summaryModel')}
                  hint={t('hints.summaryModel')}
                >
                  <select
                    id={`${formId}-summary-model`}
                    className={fieldClassName}
                    disabled={saving}
                    value={form.summaryModel ?? ''}
                    onChange={(event) =>
                      setForm((prev) =>
                        prev ? { ...prev, summaryModel: event.target.value || null } : prev
                      )
                    }
                  >
                    <option value="">{t('sameAsMain')}</option>
                    {summaryModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>

              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField
                  id={`${formId}-temperature`}
                  label={t('fields.temperature')}
                  hint={t('hints.temperature')}
                  value={form.temperature}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.temperature.min}
                  max={PLATFORM_AI_LIMITS.temperature.max}
                  step="0.1"
                  onChange={(value) =>
                    setForm((prev) => (prev ? { ...prev, temperature: value } : prev))
                  }
                />

                <NumberField
                  id={`${formId}-max-output-tokens`}
                  label={t('fields.maxOutputTokens')}
                  hint={t('hints.maxOutputTokens')}
                  value={String(form.maxOutputTokens)}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.maxOutputTokens.min}
                  max={PLATFORM_AI_LIMITS.maxOutputTokens.max}
                  step="1"
                  onChange={(value) => {
                    const next = Number(value)
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            maxOutputTokens: Number.isFinite(next)
                              ? Math.trunc(next)
                              : prev.maxOutputTokens,
                          }
                        : prev
                    )
                  }}
                />

                <NumberField
                  id={`${formId}-debounce`}
                  label={t('fields.debounceDelaySeconds')}
                  hint={t('hints.debounceDelaySeconds')}
                  value={form.debounceDelaySeconds}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.debounceDelaySeconds.min}
                  max={PLATFORM_AI_LIMITS.debounceDelaySeconds.max}
                  step="1"
                  onChange={(value) =>
                    setForm((prev) => (prev ? { ...prev, debounceDelaySeconds: value } : prev))
                  }
                />

                <NumberField
                  id={`${formId}-attribution`}
                  label={t('fields.campaignAttributionWindowHours')}
                  hint={t('hints.campaignAttributionWindowHours')}
                  value={form.campaignAttributionWindowHours}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.campaignAttributionWindowHours.min}
                  max={PLATFORM_AI_LIMITS.campaignAttributionWindowHours.max}
                  step="1"
                  onChange={(value) =>
                    setForm((prev) =>
                      prev ? { ...prev, campaignAttributionWindowHours: value } : prev
                    )
                  }
                />
              </div>
            </SettingsSection>

            <div className="border-t border-dash-border" />

            <SettingsSection
              title={t('sections.knowledge.title')}
              description={t('sections.knowledge.description')}
            >
              {reindexStatus === 'running' ? (
                <p role="status" className="text-sm leading-6 text-mute">
                  {t('reindexRunning')}
                </p>
              ) : null}
              {reindexStatus === 'failed' ? (
                <p role="alert" className="text-sm leading-6 text-negative">
                  {t('reindexFailed')}
                </p>
              ) : null}
              <FieldShell
                id={`${formId}-embedding`}
                label={t('fields.embeddingModel')}
                hint={t('hints.embeddingModel')}
              >
                <select
                  id={`${formId}-embedding`}
                  className={fieldClassName}
                  disabled={saving || embedLocked}
                  value={form.embeddingModel}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, embeddingModel: event.target.value } : prev
                    )
                  }
                >
                  {embeddingModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
                <NumberField
                  id={`${formId}-confidence`}
                  label={t('fields.minConfidenceScore')}
                  hint={t('hints.minConfidenceScore')}
                  value={form.minConfidenceScore}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.minConfidenceScore.min}
                  max={PLATFORM_AI_LIMITS.minConfidenceScore.max}
                  step="0.05"
                  onChange={(value) =>
                    setForm((prev) => (prev ? { ...prev, minConfidenceScore: value } : prev))
                  }
                />
                <NumberField
                  id={`${formId}-working-set`}
                  label={t('fields.workingSetSize')}
                  hint={t('hints.workingSetSize')}
                  value={form.workingSetSize}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.workingSetSize.min}
                  max={PLATFORM_AI_LIMITS.workingSetSize.max}
                  step="1"
                  onChange={(value) =>
                    setForm((prev) => (prev ? { ...prev, workingSetSize: value } : prev))
                  }
                />
                <NumberField
                  id={`${formId}-summary`}
                  label={t('fields.summaryTurnThreshold')}
                  hint={t('hints.summaryTurnThreshold')}
                  value={form.summaryTurnThreshold}
                  disabled={saving}
                  min={PLATFORM_AI_LIMITS.summaryTurnThreshold.min}
                  max={PLATFORM_AI_LIMITS.summaryTurnThreshold.max}
                  step="1"
                  onChange={(value) =>
                    setForm((prev) => (prev ? { ...prev, summaryTurnThreshold: value } : prev))
                  }
                />
              </div>
            </SettingsSection>

            <div className="border-t border-dash-border" />

            <SettingsSection
              title={t('sections.instructions.title')}
              description={t('sections.instructions.description')}
            >
              <FieldShell
                id={`${formId}-prompt`}
                label={t('fields.systemPrompt')}
                hint={t('hints.systemPrompt')}
              >
                <textarea
                  id={`${formId}-prompt`}
                  className={textareaClassName}
                  disabled={saving}
                  spellCheck={false}
                  value={form.systemPrompt}
                  placeholder={t('promptPlaceholder')}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, systemPrompt: event.target.value } : prev))
                  }
                />
              </FieldShell>
            </SettingsSection>

            <div className="border-t border-dash-border" />

            <SettingsSection
              title={t('sections.handover.title')}
              description={t('sections.handover.description')}
            >
              <FieldShell
                id={`${formId}-keywords`}
                label={t('fields.handoverKeywords')}
                hint={t('hints.handoverKeywords')}
              >
                <div className="overflow-hidden rounded-xl border border-dash-border bg-canvas">
                  <div className="flex min-h-12 flex-wrap gap-2 border-b border-dash-border bg-dash-surface/40 px-3 py-2.5">
                    {form.handoverKeywords.length === 0 ? (
                      <p className="py-1 text-xs text-mute">{t('keywordsEmpty')}</p>
                    ) : (
                      form.handoverKeywords.map((keyword, index) => (
                        <span
                          key={`${keyword}-${index}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-dash-border"
                        >
                          {keyword}
                          <button
                            type="button"
                            className="rounded text-mute hover:text-ink"
                            aria-label={t('removeKeyword', { keyword })}
                            disabled={saving}
                            onClick={() => removeKeyword(index)}
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    id={`${formId}-keywords`}
                    className="h-11 w-full border-0 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-mute disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={saving}
                    value={keywordDraft}
                    placeholder={t('keywordPlaceholder')}
                    onChange={(event) => setKeywordDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault()
                        addKeyword(keywordDraft)
                      }
                      if (event.key === 'Backspace' && !keywordDraft) {
                        removeKeyword(form.handoverKeywords.length - 1)
                      }
                    }}
                    onBlur={() => {
                      if (keywordDraft.trim()) addKeyword(keywordDraft)
                    }}
                  />
                </div>
              </FieldShell>
            </SettingsSection>
          </div>

          <div
            className={cn(
              'sticky bottom-0 z-10 flex flex-col gap-3 border-t border-dash-border',
              'bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-7'
            )}
          >
            <p className="text-xs leading-5 text-mute sm:max-w-md">{t('saveFooterHint')}</p>
            <Button type="submit" size="sm" className="w-full gap-2 sm:w-auto" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      ) : null}
    </DashboardPanel>
  )
}
