'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authInputClassName } from '@/components/auth/auth-field-styles'

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

function statusLabel(
  t: ReturnType<typeof useTranslations>,
  config: OrganizationSmtpConfig | null | undefined
) {
  if (!config) return t('status.default')
  if (config.status === 'failed') return t('status.failed')
  return t('status.verified')
}

export function OrganizationSmtpSection() {
  const t = useTranslations('dashboard.settings.smtp')
  const queryClient = useQueryClient()
  const { canManageSettings, tenantOrganizationId } = useOrganizations()
  const [draft, setDraft] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const smtpQuery = useQuery({
    queryKey: queryKeys.organizations.smtp(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canManageSettings,
    queryFn: async (): Promise<OrganizationSmtpConfig | null> => {
      const { data } = await api.organizations.getSmtp(tenantOrganizationId!)
      return data.data
    },
  })

  const config = smtpQuery.data
  const form = draft ?? formFromConfig(config)

  const patchForm = useCallback(
    (updater: (prev: FormState) => FormState) => {
      setDraft((prev) => updater(prev ?? formFromConfig(config)))
    },
    [config]
  )

  const badgeClass = useMemo(() => {
    if (!config) {
      return 'border-dash-border bg-dash-surface text-body'
    }
    if (config.status === 'failed') {
      return 'border-negative/30 bg-negative/5 text-negative'
    }
    return 'border-primary/30 bg-primary-pale/40 text-positive-deep'
  }, [config])

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
          form.transport === 'smtp' && form.password.trim() ? form.password.trim() : undefined,
        apiKey: form.transport === 'api' && form.apiKey.trim() ? form.apiKey.trim() : undefined,
      }
      return api.organizations.updateSmtp(tenantOrganizationId!, body)
    },
    onSuccess: async () => {
      setDraft(null)
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
        password: form.transport === 'smtp' && form.password.trim() ? form.password.trim() : null,
        apiKey: form.transport === 'api' && form.apiKey.trim() ? form.apiKey.trim() : null,
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
      setDraft(null)
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

  if (!tenantOrganizationId || !canManageSettings) {
    return null
  }

  const pending = saveMutation.isPending || testMutation.isPending || deleteMutation.isPending

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-3 py-1 text-xs font-medium', badgeClass)}>
          {statusLabel(t, config)}
        </span>
        {config?.lastTestedAt ? (
          <span className="text-xs text-muted">
            {t('lastTested', {
              date: new Date(config.lastTestedAt).toLocaleString(),
            })}
          </span>
        ) : null}
      </div>

      {config?.lastErrorMessage ? (
        <p className="mt-2 text-sm text-negative">
          {t('lastError', { message: config.lastErrorMessage })}
        </p>
      ) : null}

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          setSuccess(null)
          setError(null)
          saveMutation.mutate()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>{t('provider.label')}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={form.providerPreset === preset ? 'default' : 'outline'}
                  onClick={() => patchForm((current) => applyPreset(current, preset))}
                >
                  {t(`provider.${preset}`)}
                </Button>
              ))}
            </div>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={form.transport === 'smtp' ? 'default' : 'outline'}
              onClick={() => patchForm((current) => ({ ...current, transport: 'smtp' }))}
            >
              SMTP
            </Button>
            <Button
              type="button"
              size="sm"
              variant={form.transport === 'api' ? 'default' : 'outline'}
              onClick={() => patchForm((current) => ({ ...current, transport: 'api' }))}
            >
              API
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>{t('fields.senderName')}</FieldLabel>
              <Input
                className={authInputClassName}
                value={form.senderName}
                onChange={(event) =>
                  patchForm((current) => ({ ...current, senderName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>{t('fields.senderEmail')}</FieldLabel>
              <Input
                className={authInputClassName}
                type="email"
                value={form.senderEmail}
                onChange={(event) =>
                  patchForm((current) => ({ ...current, senderEmail: event.target.value }))
                }
              />
            </Field>
          </div>

          {form.transport === 'smtp' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{t('fields.host')}</FieldLabel>
                  <Input
                    className={authInputClassName}
                    value={form.host}
                    onChange={(event) =>
                      patchForm((current) => ({ ...current, host: event.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('fields.port')}</FieldLabel>
                  <Input
                    className={authInputClassName}
                    value={form.port}
                    onChange={(event) =>
                      patchForm((current) => ({ ...current, port: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel>{t('fields.username')}</FieldLabel>
                <Input
                  className={authInputClassName}
                  value={form.username}
                  onChange={(event) =>
                    patchForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('fields.password')}</FieldLabel>
                <Input
                  className={authInputClassName}
                  type="password"
                  placeholder={config?.hasPassword ? t('fields.passwordPlaceholder') : undefined}
                  value={form.password}
                  onChange={(event) =>
                    patchForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <label className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(event) =>
                      patchForm((current) => ({
                        ...current,
                        secure: event.target.checked,
                        port: event.target.checked ? '465' : '587',
                      }))
                    }
                  />
                  {t('fields.secure')}
                </label>
              </Field>
            </>
          ) : (
            <Field>
              <FieldLabel>{t('fields.password')}</FieldLabel>
              <Input
                className={authInputClassName}
                type="password"
                placeholder={config?.hasApiKey ? t('fields.passwordPlaceholder') : undefined}
                value={form.apiKey}
                onChange={(event) =>
                  patchForm((current) => ({ ...current, apiKey: event.target.value }))
                }
              />
              <FieldDescription>Resend, SendGrid, or Brevo API key</FieldDescription>
            </Field>
          )}
        </FieldGroup>

        {error ? <FieldError>{error}</FieldError> : null}
        {success ? (
          <p role="status" className="text-sm text-positive-deep">
            {success}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {config ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setResetOpen(true)}
            >
              {t('actions.reset')}
            </Button>
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
            {t('actions.test')}
          </Button>
          <Button type="submit" disabled={pending || smtpQuery.isLoading} className="gap-2">
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t('actions.save')}
          </Button>
        </div>
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
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm text-body">{t('actions.resetConfirm')}</p>
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
                {t('actions.reset')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPanel>
  )
}
