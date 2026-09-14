'use client'

import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type PlatformAiConfig,
  type UpdatePlatformAiConfigBody,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import {
  PLATFORM_AI_LIMITS,
  PLATFORM_AI_PROVIDERS,
  catalogForProvider,
  selectOptionsWithCurrent,
} from './platform-ai-models'

/** Exact phrase required before toggling platform `isEnabled` (kill switch). */
const KILL_SWITCH_CONFIRM_PHRASE = 'confirm kill'

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
  const queryClient = useQueryClient()
  const { toast, showToast, clearToast } = useDashboardToast()

  const [draft, setDraft] = useState<FormState | null>(null)
  const [killConfirmOpen, setKillConfirmOpen] = useState(false)
  const [killConfirmNextEnabled, setKillConfirmNextEnabled] = useState(false)
  const [killConfirmInput, setKillConfirmInput] = useState('')

  const configQuery = useQuery({
    queryKey: queryKeys.admin.aiConfig,
    queryFn: async (): Promise<PlatformAiConfig> => {
      const { data } = await api.superAdmin.aiConfig.get()
      const config = unwrapConfig(data)
      if (!config) {
        throw Object.assign(new Error('Platform AI config missing'), {
          code: 'E_PLATFORM_AI_CONFIG_NOT_FOUND',
        })
      }
      return config
    },
    refetchInterval: (query) =>
      query.state.data && reindexStatusFromConfig(query.state.data) === 'running' ? 2000 : false,
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdatePlatformAiConfigBody): Promise<PlatformAiConfig> => {
      const { data } = await api.superAdmin.aiConfig.update(payload)
      const config = unwrapConfig(data)
      if (!config) {
        throw Object.assign(new Error('Platform AI config missing'), {
          code: 'E_PLATFORM_AI_CONFIG_NOT_FOUND',
        })
      }
      return config
    },
    onSuccess: (config) => {
      queryClient.setQueryData(queryKeys.admin.aiConfig, config)
      setDraft(formFromConfig(config))
    },
  })

  const reindexStatus = configQuery.data
    ? reindexStatusFromConfig(configQuery.data)
    : ('idle' as const)
  const saving = updateMutation.isPending
  const loading = configQuery.isLoading && !configQuery.data
  const loadError = configQuery.isError
    ? (() => {
        const key = mapAiConfigError(configQuery.error, 'load')
        return key === 'raw'
          ? (configQuery.error as unknown as ApiError).message
          : t(`errors.${key}`)
      })()
    : null

  // Prefer local edits; otherwise mirror the latest server config (incl. reindex polls).
  const form = draft ?? (configQuery.data ? formFromConfig(configQuery.data) : null)

  const patchForm = useCallback(
    (updater: (prev: FormState) => FormState) => {
      setDraft((prev) => {
        const base = prev ?? (configQuery.data ? formFromConfig(configQuery.data) : null)
        if (!base) return prev
        return updater(base)
      })
    },
    [configQuery.data]
  )

  const openKillConfirm = useCallback((nextEnabled: boolean) => {
    setKillConfirmNextEnabled(nextEnabled)
    setKillConfirmInput('')
    setKillConfirmOpen(true)
  }, [])

  const closeKillConfirm = useCallback(() => {
    setKillConfirmOpen(false)
    setKillConfirmInput('')
  }, [])

  const confirmKillSwitch = useCallback(() => {
    if (killConfirmInput !== KILL_SWITCH_CONFIRM_PHRASE) return
    patchForm((prev) => ({ ...prev, isEnabled: killConfirmNextEnabled }))
    closeKillConfirm()
  }, [closeKillConfirm, killConfirmInput, killConfirmNextEnabled, patchForm])

  const killConfirmMatches = killConfirmInput === KILL_SWITCH_CONFIRM_PHRASE

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
      ...(reindexStatus === 'failed' ? { confirmReindex: true } : {}),
    }

    try {
      try {
        await updateMutation.mutateAsync(body)
      } catch (err) {
        const apiError = err as ApiError
        if (apiError.code !== 'E_PLATFORM_AI_REINDEX_REQUIRED') throw err
        const confirmed = window.confirm(t('reindexConfirm', { count: apiError.chunkCount ?? 0 }))
        if (!confirmed) return
        await updateMutation.mutateAsync({ ...body, confirmReindex: true })
      }
      showToast(t('saved'), 'success')
    } catch (err) {
      const key = mapAiConfigError(err, 'save')
      showToast(key === 'raw' ? (err as ApiError).message : t(`errors.${key}`), 'error')
    }
  }, [clearToast, form, reindexStatus, saving, showToast, t, updateMutation])

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(null)
              void configQuery.refetch()
            }}
          >
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
                  onChange={(event) => openKillConfirm(event.target.checked)}
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
                      patchForm((prev) => ({
                        ...prev,
                        chatProvider: nextProvider,
                        chatModel: nextCatalog.defaults.chatModel,
                        summaryModel: nextCatalog.defaults.summaryModel,
                        embeddingModel: nextCatalog.defaults.embeddingModel,
                      }))
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
                      patchForm((prev) => ({ ...prev, chatModel: event.target.value }))
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
                      patchForm((prev) => ({ ...prev, summaryModel: event.target.value || null }))
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
                  onChange={(value) => patchForm((prev) => ({ ...prev, temperature: value }))}
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
                    patchForm((prev) => ({
                      ...prev,
                      maxOutputTokens: Number.isFinite(next)
                        ? Math.trunc(next)
                        : prev.maxOutputTokens,
                    }))
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
                    patchForm((prev) => ({ ...prev, debounceDelaySeconds: value }))
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
                    patchForm((prev) => ({ ...prev, campaignAttributionWindowHours: value }))
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
                    patchForm((prev) => ({ ...prev, embeddingModel: event.target.value }))
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
                    patchForm((prev) => ({ ...prev, minConfidenceScore: value }))
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
                  onChange={(value) => patchForm((prev) => ({ ...prev, workingSetSize: value }))}
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
                    patchForm((prev) => ({ ...prev, summaryTurnThreshold: value }))
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
                    patchForm((prev) => ({ ...prev, systemPrompt: event.target.value }))
                  }
                />
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

      <Dialog
        open={killConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeKillConfirm()
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>
              {killConfirmNextEnabled
                ? t('killConfirm.titleEnable')
                : t('killConfirm.titleDisable')}
            </DialogTitle>
            <DialogDescription>
              {killConfirmNextEnabled
                ? t('killConfirm.bodyEnable', { phrase: KILL_SWITCH_CONFIRM_PHRASE })
                : t('killConfirm.bodyDisable', { phrase: KILL_SWITCH_CONFIRM_PHRASE })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 px-5 py-4 sm:px-6">
            <label htmlFor={`${formId}-kill-confirm`} className="block text-sm font-medium text-ink">
              {t('killConfirm.phraseLabel', { phrase: KILL_SWITCH_CONFIRM_PHRASE })}
            </label>
            <Input
              id={`${formId}-kill-confirm`}
              autoComplete="off"
              spellCheck={false}
              value={killConfirmInput}
              placeholder={KILL_SWITCH_CONFIRM_PHRASE}
              onChange={(event) => setKillConfirmInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmKillSwitch()
                }
              }}
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-dash-border sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeKillConfirm}>
              {t('killConfirm.cancel')}
            </Button>
            <Button
              type="button"
              variant={killConfirmNextEnabled ? 'default' : 'destructive'}
              disabled={!killConfirmMatches}
              onClick={confirmKillSwitch}
            >
              {t('killConfirm.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPanel>
  )
}
