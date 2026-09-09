'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  Check,
  ChevronDown,
  Cloud,
  Loader2,
  MoreHorizontal,
  Server,
} from 'lucide-react'
import { FaAws } from 'react-icons/fa'
import { SiBrevo, SiGmail, SiResend } from 'react-icons/si'
import {
  api,
  type ApiError,
  type OrganizationSmtpConfig,
  type OrganizationSmtpProviderPreset,
  type OrganizationSmtpTransport,
  type UpsertOrganizationSmtpBody,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { authInputClassName } from '@/components/auth/auth-field-styles'

function normalizeMailSecret(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '')
  return normalized.length > 0 ? normalized : null
}

const PRESET_OPTIONS: OrganizationSmtpProviderPreset[] = [
  'gmail',
  'sendgrid',
  'resend',
  'ses',
  'brevo',
  'custom',
]

const PRESET_DEFAULTS: Record<
  OrganizationSmtpProviderPreset,
  Partial<UpsertOrganizationSmtpBody>
> = {
  gmail: {
    transport: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
  sendgrid: { transport: 'api' },
  resend: { transport: 'api' },
  ses: {
    transport: 'smtp',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
  },
  brevo: { transport: 'api' },
  custom: { transport: 'smtp' },
}

/** Presets whose host/port come from known defaults (shown under Advanced). */
const ADVANCED_CONNECTION_PRESETS: ReadonlySet<OrganizationSmtpProviderPreset> = new Set([
  'gmail',
  'ses',
])

type FormState = {
  transport: OrganizationSmtpTransport
  providerPreset: OrganizationSmtpProviderPreset
  senderName: string
  senderEmail: string
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  apiKey: string
}

type ConnectionUiStatus = 'connected' | 'failed' | 'notConfigured' | 'testing'

function emptyForm(): FormState {
  return {
    transport: 'smtp',
    providerPreset: 'custom',
    senderName: '',
    senderEmail: '',
    host: '',
    port: '587',
    secure: false,
    username: '',
    password: '',
    apiKey: '',
  }
}

function formFromConfig(config: OrganizationSmtpConfig | null | undefined): FormState {
  if (!config) return emptyForm()
  return {
    transport: config.transport,
    providerPreset: config.providerPreset,
    senderName: config.senderName,
    senderEmail: config.senderEmail,
    host: config.host ?? '',
    port: config.port ? String(config.port) : '587',
    secure: Boolean(config.secure),
    username: config.username ?? '',
    password: '',
    apiKey: '',
  }
}

function applyPreset(current: FormState, preset: OrganizationSmtpProviderPreset): FormState {
  const defaults = PRESET_DEFAULTS[preset]
  return {
    ...current,
    providerPreset: preset,
    transport: defaults.transport ?? current.transport,
    host: defaults.host ?? current.host,
    port: defaults.port ? String(defaults.port) : current.port,
    secure: defaults.secure ?? current.secure,
  }
}

function resolveConnectionStatus(
  config: OrganizationSmtpConfig | null | undefined,
  isTesting: boolean
): ConnectionUiStatus {
  if (isTesting) return 'testing'
  if (!config) return 'notConfigured'
  if (config.status === 'failed') return 'failed'
  if (config.status === 'verified') return 'connected'
  return 'notConfigured'
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffSec = Math.round((Date.now() - then) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return rtf.format(-diffSec, 'second')
  if (abs < 3600) return rtf.format(-Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour')
  return rtf.format(-Math.round(diffSec / 86400), 'day')
}

function ProviderIcon({ preset }: { preset: OrganizationSmtpProviderPreset }) {
  const className = 'size-5 shrink-0'
  switch (preset) {
    case 'gmail':
      return <SiGmail className={cn(className, 'text-[#EA4335]')} aria-hidden />
    case 'sendgrid':
      return <SendGridMark className={className} />
    case 'resend':
      return <SiResend className={cn(className, 'text-ink')} aria-hidden />
    case 'ses':
      return <FaAws className={cn(className, 'text-[#FF9900]')} aria-hidden />
    case 'brevo':
      return <SiBrevo className={cn(className, 'text-[#0B996E]')} aria-hidden />
    case 'custom':
      return <Server className={cn(className, 'text-mute')} aria-hidden />
    default:
      return <Cloud className={cn(className, 'text-mute')} aria-hidden />
  }
}

function SendGridMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-5 items-center justify-center rounded bg-[#1A82E2] text-[10px] font-bold text-white',
        className
      )}
      aria-hidden
    >
      SG
    </span>
  )
}

function StatusDot({
  status,
  className,
}: {
  status: ConnectionUiStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        status === 'connected' && 'bg-positive',
        status === 'failed' && 'bg-negative',
        status === 'testing' && 'animate-pulse bg-warning',
        status === 'notConfigured' && 'border border-mute bg-transparent',
        className
      )}
      aria-hidden
    />
  )
}

export function OrganizationSmtpSection() {
  const t = useTranslations('dashboard.settings.smtp')
  const queryClient = useQueryClient()
  const { canManageSettings, tenantOrganizationId } = useOrganizations()
  const [draft, setDraft] = useState<FormState | null>(null)
  const [providerChosen, setProviderChosen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const smtpQuery = useQuery({
    queryKey: queryKeys.organizations.smtp(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canManageSettings,
    queryFn: async (): Promise<OrganizationSmtpConfig | null> => {
      const { data } = await api.organizations.getSmtp(tenantOrganizationId!)
      return data.data
    },
  })

  const config = smtpQuery.data
  const hasSavedConfig = Boolean(config)
  const form = draft ?? formFromConfig(config)
  const showFormFields = hasSavedConfig || providerChosen || draft !== null

  const patchForm = useCallback(
    (updater: (prev: FormState) => FormState) => {
      setDraft((prev) => updater(prev ?? formFromConfig(config)))
    },
    [config]
  )

  const selectProvider = useCallback(
    (preset: OrganizationSmtpProviderPreset) => {
      setProviderChosen(true)
      setSuccess(null)
      setError(null)
      patchForm((current) => applyPreset(current, preset))
    },
    [patchForm]
  )

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: UpsertOrganizationSmtpBody = {
        transport: form.transport,
        providerPreset: form.providerPreset,
        senderName: form.senderName.trim(),
        senderEmail: form.senderEmail.trim(),
        host: form.transport === 'smtp' ? form.host.trim() : null,
        port: form.transport === 'smtp' ? Number(form.port) : null,
        secure: form.transport === 'smtp' ? form.secure : null,
        username: form.transport === 'smtp' ? form.username.trim() : null,
        password:
          form.transport === 'smtp' ? (normalizeMailSecret(form.password) ?? undefined) : undefined,
        apiKey: form.transport === 'api' ? (normalizeMailSecret(form.apiKey) ?? undefined) : undefined,
      }
      return api.organizations.updateSmtp(tenantOrganizationId!, body)
    },
    onSuccess: async () => {
      setDraft(null)
      setProviderChosen(false)
      setSuccess(t('toast.saveSuccess'))
      setError(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.smtp(tenantOrganizationId),
      })
    },
    onError: (err: ApiError) => {
      setSuccess(null)
      setError(t('toast.saveFailed', { reason: err.message }))
    },
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const draftConfig: UpsertOrganizationSmtpBody = {
        transport: form.transport,
        providerPreset: form.providerPreset,
        senderName: form.senderName.trim(),
        senderEmail: form.senderEmail.trim(),
        host: form.transport === 'smtp' ? form.host.trim() : null,
        port: form.transport === 'smtp' ? Number(form.port) : null,
        secure: form.transport === 'smtp' ? form.secure : null,
        username: form.transport === 'smtp' ? form.username.trim() : null,
        password: form.transport === 'smtp' ? normalizeMailSecret(form.password) : null,
        apiKey: form.transport === 'api' ? normalizeMailSecret(form.apiKey) : null,
      }
      return api.organizations.testSmtp(tenantOrganizationId!, { draftConfig })
    },
    onSuccess: () => {
      setSuccess(t('toast.testSuccess'))
      setError(null)
    },
    onError: (err: ApiError) => {
      setSuccess(null)
      setError(t('toast.testFailed', { reason: err.message }))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.organizations.deleteSmtp(tenantOrganizationId!),
    onSuccess: async () => {
      setResetOpen(false)
      setMenuOpen(false)
      setDraft(null)
      setProviderChosen(false)
      setSuccess(t('toast.deleteSuccess'))
      setError(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.smtp(tenantOrganizationId),
      })
    },
    onError: () => {
      setError(t('toast.deleteFailed'))
    },
  })

  const connectionStatus = resolveConnectionStatus(config, testMutation.isPending)
  const savedProviderLabel = config ? t(`provider.${config.providerPreset}`) : null

  const headerStatusLabel = useMemo(() => {
    if (connectionStatus === 'testing') return t('status.testing')
    if (connectionStatus === 'notConfigured') return t('status.notConfigured')
    if (connectionStatus === 'failed') {
      return savedProviderLabel
        ? t('status.withProvider', {
            provider: savedProviderLabel,
            status: t('status.failed'),
          })
        : t('status.failed')
    }
    return savedProviderLabel
      ? t('status.withProvider', {
          provider: savedProviderLabel,
          status: t('status.connected'),
        })
      : t('status.connected')
  }, [connectionStatus, savedProviderLabel, t])

  const authPasswordLabel =
    form.providerPreset === 'gmail' ? t('fields.appPassword') : t('fields.password')

  const pending = saveMutation.isPending || testMutation.isPending || deleteMutation.isPending
  const isSmtp = form.transport === 'smtp'
  const isApi = form.transport === 'api'
  const useAdvancedConnection =
    isSmtp && ADVANCED_CONNECTION_PRESETS.has(form.providerPreset)

  if (!tenantOrganizationId || !canManageSettings) {
    return null
  }

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('title')}
        description={t('description')}
        action={
          <div
            className={cn(
              'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              connectionStatus === 'connected' &&
                'border-primary/30 bg-primary-pale/40 text-positive-deep',
              connectionStatus === 'failed' && 'border-negative/30 bg-negative/5 text-negative',
              connectionStatus === 'testing' &&
                'border-warning/35 bg-dash-warn-soft text-warning-content',
              connectionStatus === 'notConfigured' &&
                'border-dash-border bg-dash-surface text-body'
            )}
            role="status"
            aria-live="polite"
          >
            <StatusDot status={connectionStatus} />
            <span className="truncate">{headerStatusLabel}</span>
          </div>
        }
      />

      {hasSavedConfig && config ? (
        <div
          className={cn(
            'mt-5 rounded-2xl border px-4 py-3.5 sm:px-5',
            config.status === 'failed'
              ? 'border-negative/30 bg-negative/5'
              : 'border-primary/25 bg-primary-pale/30'
          )}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-dash-border bg-canvas">
              <ProviderIcon preset={config.providerPreset} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="font-display text-sm font-semibold text-ink">
                  {t(`provider.${config.providerPreset}`)}
                </p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-medium',
                    config.status === 'failed' ? 'text-negative' : 'text-positive-deep'
                  )}
                >
                  <StatusDot status={config.status === 'failed' ? 'failed' : 'connected'} />
                  {config.status === 'failed' ? t('status.failed') : t('status.active')}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-body">{config.senderEmail}</p>
              {config.lastTestedAt ? (
                <p
                  className="mt-1 text-xs text-mute"
                  title={new Date(config.lastTestedAt).toLocaleString()}
                >
                  {config.status === 'failed'
                    ? t('currentConfig.failedAt', {
                        date: formatRelativeTime(config.lastTestedAt),
                      })
                    : t('currentConfig.verifiedAt', {
                        date: formatRelativeTime(config.lastTestedAt),
                      })}
                </p>
              ) : null}
              <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-mute">
                <span className="font-medium text-body">{t('currentConfig.label')}</span>
                <span aria-hidden>·</span>
                <span>
                  {t('currentConfig.summary', {
                    provider: t(`provider.${config.providerPreset}`),
                    email: config.senderEmail,
                  })}
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={config.status === 'failed' ? 'failed' : 'connected'} />
                  {config.status === 'failed' ? t('status.failed') : t('status.connected')}
                  <span aria-hidden>·</span>
                  {config.status === 'failed' ? t('provider.failed') : t('status.verified')}
                </span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {config?.lastErrorMessage ? (
        <p className="mt-3 text-sm text-negative" role="alert">
          {t('lastError', { message: config.lastErrorMessage })}
        </p>
      ) : null}

      {!hasSavedConfig && !showFormFields ? (
        <div className="mt-6 rounded-2xl border border-dashed border-dash-border bg-dash-surface/40 px-4 py-8 text-center sm:px-6">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-dash-border bg-canvas px-3 py-1 text-xs font-medium text-body">
            <StatusDot status="notConfigured" />
            {t('status.notConfigured')}
          </div>
          <h3 className="font-display text-base font-semibold text-ink">{t('empty.title')}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-mute">
            {t('empty.description')}
          </p>
        </div>
      ) : null}

      <form
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          setSuccess(null)
          setError(null)
          saveMutation.mutate()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel id="smtp-provider-label">{t('provider.label')}</FieldLabel>
            <div
              role="radiogroup"
              aria-labelledby="smtp-provider-label"
              className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {PRESET_OPTIONS.map((preset) => {
                const selected = showFormFields && form.providerPreset === preset
                const isSavedProvider = config?.providerPreset === preset
                const savedConnected =
                  isSavedProvider && config?.status === 'verified'
                const savedFailed = isSavedProvider && config?.status === 'failed'

                return (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={pending}
                    onClick={() => selectProvider(preset)}
                    className={cn(
                      'group relative flex min-h-[5.5rem] flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-[border-color,background-color,box-shadow]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      selected
                        ? 'border-primary bg-primary-pale/40 ring-1 ring-primary/25'
                        : 'border-dash-border bg-canvas hover:border-dash-border-strong hover:bg-dash-surface/60',
                      pending && 'opacity-60'
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="flex size-9 items-center justify-center rounded-xl border border-dash-border bg-dash-surface/80">
                        <ProviderIcon preset={preset} />
                      </span>
                      {selected ? (
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-on-primary">
                          <Check className="size-3" aria-hidden />
                          <span className="sr-only">{t('provider.selected')}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{t(`provider.${preset}`)}</p>
                      <p className="mt-0.5 text-xs leading-5 text-mute">
                        {t(`provider.descriptions.${preset}`)}
                      </p>
                      {savedConnected ? (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-positive-deep">
                          <StatusDot status="connected" />
                          {t('provider.connected')}
                        </p>
                      ) : null}
                      {savedFailed ? (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-negative">
                          <StatusDot status="failed" />
                          {t('provider.failed')}
                        </p>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </Field>

          {showFormFields ? (
            <>
              <Separator className="bg-dash-border" />

              <section className="space-y-4" aria-labelledby="smtp-sender-heading">
                <div>
                  <h3
                    id="smtp-sender-heading"
                    className="text-sm font-semibold tracking-tight text-ink"
                  >
                    {t('sections.sender.title')}
                  </h3>
                  <p className="mt-0.5 text-sm leading-6 text-mute">
                    {t('sections.sender.description')}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="smtp-sender-name">{t('fields.senderName')}</FieldLabel>
                    <Input
                      id="smtp-sender-name"
                      className={authInputClassName}
                      autoComplete="organization"
                      value={form.senderName}
                      disabled={pending}
                      onChange={(event) =>
                        patchForm((current) => ({
                          ...current,
                          senderName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtp-sender-email">{t('fields.senderEmail')}</FieldLabel>
                    <Input
                      id="smtp-sender-email"
                      className={authInputClassName}
                      type="email"
                      autoComplete="email"
                      value={form.senderEmail}
                      disabled={pending}
                      onChange={(event) =>
                        patchForm((current) => ({
                          ...current,
                          senderEmail: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
              </section>

              {isSmtp && form.providerPreset === 'custom' ? (
                <section className="space-y-4" aria-labelledby="smtp-connection-heading">
                  <div>
                    <h3
                      id="smtp-connection-heading"
                      className="text-sm font-semibold tracking-tight text-ink"
                    >
                      {t('sections.connection.title')}
                    </h3>
                    <p className="mt-0.5 text-sm leading-6 text-mute">
                      {t('sections.connection.description')}
                    </p>
                  </div>
                  <SmtpConnectionFields
                    form={form}
                    pending={pending}
                    patchForm={patchForm}
                    t={t}
                  />
                </section>
              ) : null}

              {useAdvancedConnection ? (
                <section className="rounded-2xl border border-dash-border bg-dash-surface/30">
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-inset'
                    )}
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((open) => !open)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('sections.advancedConnection.title')}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-mute">
                        {t('sections.advancedConnection.description')}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-mute transition-transform',
                        advancedOpen && 'rotate-180'
                      )}
                      aria-hidden
                    />
                  </button>
                  {advancedOpen ? (
                    <div className="border-t border-dash-border px-4 py-4">
                      <SmtpConnectionFields
                        form={form}
                        pending={pending}
                        patchForm={patchForm}
                        t={t}
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-4" aria-labelledby="smtp-auth-heading">
                <div>
                  <h3
                    id="smtp-auth-heading"
                    className="text-sm font-semibold tracking-tight text-ink"
                  >
                    {t('sections.authentication.title')}
                  </h3>
                  <p className="mt-0.5 text-sm leading-6 text-mute">
                    {t('sections.authentication.description')}
                  </p>
                </div>

                {isSmtp ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="smtp-username">{t('fields.username')}</FieldLabel>
                      <Input
                        id="smtp-username"
                        className={authInputClassName}
                        autoComplete="username"
                        value={form.username}
                        disabled={pending}
                        onChange={(event) =>
                          patchForm((current) => ({
                            ...current,
                            username: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="smtp-password">{authPasswordLabel}</FieldLabel>
                      <Input
                        id="smtp-password"
                        className={authInputClassName}
                        type="password"
                        autoComplete="new-password"
                        placeholder={
                          hasSavedConfig && config?.hasPassword
                            ? t('fields.passwordPlaceholder')
                            : undefined
                        }
                        value={form.password}
                        disabled={pending}
                        onChange={(event) =>
                          patchForm((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                {isApi ? (
                  <Field>
                    <FieldLabel htmlFor="smtp-api-key">{t('fields.apiKey')}</FieldLabel>
                    <Input
                      id="smtp-api-key"
                      className={authInputClassName}
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        hasSavedConfig && config?.hasApiKey
                          ? t('fields.apiKeyPlaceholder')
                          : undefined
                      }
                      value={form.apiKey}
                      disabled={pending}
                      onChange={(event) =>
                        patchForm((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                  </Field>
                ) : null}
              </section>

              {isSmtp ? (
                <section
                  className="rounded-2xl border border-dash-border px-4 py-4"
                  aria-labelledby="smtp-security-heading"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3
                        id="smtp-security-heading"
                        className="text-sm font-semibold tracking-tight text-ink"
                      >
                        {t('sections.security.title')}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-ink">{t('fields.secure')}</p>
                      <p className="mt-0.5 text-sm leading-6 text-mute">
                        {t('sections.security.description')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold tracking-wide text-mute" aria-hidden>
                        {form.secure ? t('fields.secureOn') : t('fields.secureOff')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.secure}
                        aria-label={t('fields.secure')}
                        disabled={pending}
                        onClick={() =>
                          patchForm((current) => ({
                            ...current,
                            secure: !current.secure,
                            port: !current.secure ? '465' : '587',
                          }))
                        }
                        className={cn(
                          'relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                          form.secure
                            ? 'border-primary bg-primary'
                            : 'border-dash-border bg-dash-surface'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute left-0.5 size-5 rounded-full bg-canvas shadow-sm transition-transform',
                            form.secure && 'translate-x-[1.35rem]'
                          )}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </FieldGroup>

        {error ? (
          <FieldError role="alert">{error}</FieldError>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-positive-deep">
            {success}
          </p>
        ) : null}

        {showFormFields ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-dash-border pt-5">
            {hasSavedConfig ? (
              <div ref={menuRef} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={pending}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  aria-label={t('actions.moreOptions')}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
                {menuOpen ? (
                  <ul
                    id={menuId}
                    role="menu"
                    className={cn(
                      'absolute bottom-[calc(100%+0.35rem)] right-0 z-20 min-w-[11rem] overflow-hidden rounded-xl border border-dash-border bg-canvas py-1',
                      'shadow-[0_12px_32px_rgb(15_23_42/0.1),0_2px_6px_rgb(15_23_42/0.04)]'
                    )}
                  >
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2 text-left text-sm font-medium text-negative hover:bg-dash-danger-soft"
                        onClick={() => {
                          setMenuOpen(false)
                          setResetOpen(true)
                        }}
                      >
                        {t('actions.reset')}
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              disabled={pending || smtpQuery.isLoading}
              className="gap-2"
              onClick={() => {
                setSuccess(null)
                setError(null)
                testMutation.mutate()
              }}
            >
              {testMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {testMutation.isPending ? t('actions.testing') : t('actions.test')}
            </Button>
            <Button type="submit" disabled={pending || smtpQuery.isLoading} className="gap-2">
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {saveMutation.isPending ? t('actions.saving') : t('actions.save')}
            </Button>
          </div>
        ) : null}
      </form>

      {resetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!deleteMutation.isPending) setResetOpen(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="smtp-reset-title"
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="smtp-reset-title" className="text-sm text-body">
              {t('actions.resetConfirm')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => setResetOpen(false)}
              >
                {t('actions.resetCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {t('actions.reset')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPanel>
  )
}

function SmtpConnectionFields({
  form,
  pending,
  patchForm,
  t,
}: {
  form: FormState
  pending: boolean
  patchForm: (updater: (prev: FormState) => FormState) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="smtp-host">{t('fields.host')}</FieldLabel>
        <Input
          id="smtp-host"
          className={authInputClassName}
          autoComplete="off"
          value={form.host}
          disabled={pending}
          onChange={(event) =>
            patchForm((current) => ({ ...current, host: event.target.value }))
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="smtp-port">{t('fields.port')}</FieldLabel>
        <Input
          id="smtp-port"
          className={authInputClassName}
          inputMode="numeric"
          autoComplete="off"
          value={form.port}
          disabled={pending}
          onChange={(event) =>
            patchForm((current) => ({ ...current, port: event.target.value }))
          }
        />
      </Field>
    </div>
  )
}
