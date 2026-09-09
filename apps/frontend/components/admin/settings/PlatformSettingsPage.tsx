'use client'

import { useCallback, useId, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type PlatformMfaEnforcement,
  type PlatformSettings,
  type UpdatePlatformSettingsBody,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'

type PlatformSettingState = 'enabled' | 'disabled' | 'scheduled'

const MFA_OPTIONS: PlatformMfaEnforcement[] = [
  'none',
  'super_admin',
  'super_admin_and_platform_admin',
  'all',
]

const STATE_STYLES: Record<PlatformSettingState, string> = {
  enabled: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  disabled: 'bg-dash-surface text-mute ring-1 ring-dash-border',
  scheduled: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
}

const fieldClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

const IP_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
const GSTIN_RE = /^$|^[0-9A-Za-z]{15}$/
const OPTIONAL_EMAIL_RE = /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FormState = {
  platformName: string
  primaryDomain: string
  supportEmail: string
  sessionTimeoutHours: string
  mfaEnforcement: PlatformMfaEnforcement
  passwordMinLength: string
  smtpDailyLimit: string
  googleSignInEnabled: boolean
  microsoftSignInEnabled: boolean
  oauthRedirectUrl: string
  maintenanceEnabled: boolean
  allowlistedIps: string
  nextMaintenanceWindow: string
  defaultTimezone: string
  dataRetentionDays: string
  apiRateLimitPerMinute: string
  billingBrandName: string
  billingLegalName: string
  billingTagline: string
  billingAddress: string
  billingGstin: string
  billingEmail: string
  billingPhone: string
  billingWebsite: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseIps(raw: string): string[] | null {
  const items = raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (items.some((item) => !IP_RE.test(item))) return null
  return items
}

function parseBoundedInteger(raw: string, min: number, max: number): number | null {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) return null
  return value
}

function unwrapSettings(payload: unknown): PlatformSettings | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: PlatformSettings } & Partial<PlatformSettings>
  const candidate = root.data && typeof root.data === 'object' ? root.data : root
  if (typeof candidate.platformName === 'string' && typeof candidate.supportEmail === 'string') {
    return candidate as PlatformSettings
  }
  return null
}

function formFromSettings(settings: PlatformSettings): FormState {
  const mfa = MFA_OPTIONS.includes(settings.mfaEnforcement as PlatformMfaEnforcement)
    ? (settings.mfaEnforcement as PlatformMfaEnforcement)
    : 'super_admin_and_platform_admin'
  return {
    platformName: settings.platformName,
    primaryDomain: settings.primaryDomain,
    supportEmail: settings.supportEmail,
    sessionTimeoutHours: String(settings.sessionTimeoutHours),
    mfaEnforcement: mfa,
    passwordMinLength: String(settings.passwordMinLength),
    smtpDailyLimit: String(settings.smtpDailyLimit),
    googleSignInEnabled: settings.googleSignInEnabled,
    microsoftSignInEnabled: settings.microsoftSignInEnabled,
    oauthRedirectUrl: settings.oauthRedirectUrl,
    maintenanceEnabled: settings.maintenanceEnabled,
    allowlistedIps: (settings.allowlistedIps ?? []).join('\n'),
    nextMaintenanceWindow: toDatetimeLocal(settings.nextMaintenanceWindow),
    defaultTimezone: settings.defaultTimezone,
    dataRetentionDays: String(settings.dataRetentionDays),
    apiRateLimitPerMinute: String(settings.apiRateLimitPerMinute),
    billingBrandName: settings.billingBrandName ?? '',
    billingLegalName: settings.billingLegalName ?? '',
    billingTagline: settings.billingTagline ?? '',
    billingAddress: settings.billingAddress ?? '',
    billingGstin: settings.billingGstin ?? '',
    billingEmail: settings.billingEmail ?? '',
    billingPhone: settings.billingPhone ?? '',
    billingWebsite: settings.billingWebsite ?? '',
  }
}

function mapSettingsError(error: unknown, fallback: 'load' | 'save'): string {
  const apiError = error as ApiError
  if (apiError.status === 401) return 'sessionExpired'
  if (
    apiError.status === 403 ||
    apiError.code === 'PERMISSION_DENIED' ||
    apiError.code === 'PLATFORM_ACCESS_DENIED'
  ) {
    return 'permissionDenied'
  }
  if (apiError.status === 404 || apiError.code === 'E_PLATFORM_SETTINGS_NOT_FOUND') return 'notFound'
  if (apiError.status === 422) return 'invalidRange'
  return apiError.message ? 'raw' : fallback === 'load' ? 'loadFailed' : 'saveFailed'
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={title} description={description} />
      <div className="mt-5 overflow-hidden rounded-2xl border border-dash-border">{children}</div>
    </DashboardPanel>
  )
}

function SettingRow({
  label,
  state,
  stateLabel,
  striped,
  children,
}: {
  label: string
  state: PlatformSettingState
  stateLabel: string
  striped?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-3.5 sm:px-5',
        striped ? 'bg-dash-surface/60' : 'bg-transparent',
        'border-b border-dash-border last:border-b-0 md:flex-row md:items-center md:justify-between'
      )}
    >
      <div className="min-w-0 md:max-w-[46%]">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <div className="mt-1 min-w-0">{children}</div>
      </div>
      <span
        className={cn(
          'inline-flex w-fit rounded-lg px-2 py-0.5 text-[11px] font-semibold',
          STATE_STYLES[state]
        )}
      >
        {stateLabel}
      </span>
    </div>
  )
}

export function PlatformSettingsPage() {
  const t = useTranslations('admin.settings')
  const formId = useId()
  const queryClient = useQueryClient()
  const { toast, showToast, clearToast } = useDashboardToast()
  const [draft, setDraft] = useState<FormState | null>(null)

  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.platformSettings,
    queryFn: async (): Promise<PlatformSettings> => {
      const response = await api.superAdmin.platformSettings.get()
      const settings = unwrapSettings(response)
      if (!settings) {
        throw Object.assign(new Error('Platform settings missing'), {
          code: 'E_PLATFORM_SETTINGS_NOT_FOUND',
        })
      }
      return settings
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdatePlatformSettingsBody): Promise<PlatformSettings> => {
      const response = await api.superAdmin.platformSettings.update(payload)
      const settings = unwrapSettings(response)
      if (!settings) {
        throw Object.assign(new Error('Platform settings missing'), {
          code: 'E_PLATFORM_SETTINGS_NOT_FOUND',
        })
      }
      return settings
    },
    onSuccess: async (settings) => {
      queryClient.setQueryData(queryKeys.admin.platformSettings, settings)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettings })
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.invoiceBillingProfile })
      setDraft(formFromSettings(settings))
    },
  })

  const saving = updateMutation.isPending
  const loading = settingsQuery.isLoading && !settingsQuery.data
  const loadError = settingsQuery.isError
    ? (() => {
        const key = mapSettingsError(settingsQuery.error, 'load')
        return key === 'raw'
          ? (settingsQuery.error as unknown as ApiError).message
          : t(`errors.${key}`)
      })()
    : null

  const form = draft ?? (settingsQuery.data ? formFromSettings(settingsQuery.data) : null)
  const live = settingsQuery.data

  const patchForm = useCallback(
    (updater: (prev: FormState) => FormState) => {
      setDraft((prev) => {
        const base = prev ?? (settingsQuery.data ? formFromSettings(settingsQuery.data) : null)
        if (!base) return prev
        return updater(base)
      })
    },
    [settingsQuery.data]
  )

  const handleSave = useCallback(async () => {
    if (!form || saving) return
    clearToast()

    const sessionTimeoutHours = parseBoundedInteger(form.sessionTimeoutHours, 1, 168)
    const passwordMinLength = parseBoundedInteger(form.passwordMinLength, 8, 128)
    const smtpDailyLimit = parseBoundedInteger(form.smtpDailyLimit, 0, 10_000_000)
    const dataRetentionDays = parseBoundedInteger(form.dataRetentionDays, 1, 3650)
    const apiRateLimitPerMinute = parseBoundedInteger(form.apiRateLimitPerMinute, 1, 1_000_000)
    const allowlistedIps = parseIps(form.allowlistedIps)

    if (
      !form.platformName.trim() ||
      !form.primaryDomain.trim() ||
      !form.supportEmail.trim() ||
      !form.oauthRedirectUrl.trim() ||
      !form.defaultTimezone.trim() ||
      sessionTimeoutHours == null ||
      passwordMinLength == null ||
      smtpDailyLimit == null ||
      dataRetentionDays == null ||
      apiRateLimitPerMinute == null ||
      allowlistedIps == null ||
      !GSTIN_RE.test(form.billingGstin.trim()) ||
      !OPTIONAL_EMAIL_RE.test(form.billingEmail.trim())
    ) {
      showToast(t('errors.invalidRange'), 'error')
      return
    }

    try {
      await updateMutation.mutateAsync({
        platformName: form.platformName.trim(),
        primaryDomain: form.primaryDomain.trim(),
        supportEmail: form.supportEmail.trim(),
        sessionTimeoutHours,
        mfaEnforcement: form.mfaEnforcement,
        passwordMinLength,
        smtpDailyLimit,
        googleSignInEnabled: form.googleSignInEnabled,
        microsoftSignInEnabled: form.microsoftSignInEnabled,
        oauthRedirectUrl: form.oauthRedirectUrl.trim(),
        maintenanceEnabled: form.maintenanceEnabled,
        allowlistedIps,
        nextMaintenanceWindow: fromDatetimeLocal(form.nextMaintenanceWindow),
        defaultTimezone: form.defaultTimezone.trim(),
        dataRetentionDays,
        apiRateLimitPerMinute,
        billingBrandName: form.billingBrandName.trim(),
        billingLegalName: form.billingLegalName.trim(),
        billingTagline: form.billingTagline.trim(),
        billingAddress: form.billingAddress.trim(),
        billingGstin: form.billingGstin.trim(),
        billingEmail: form.billingEmail.trim(),
        billingPhone: form.billingPhone.trim(),
        billingWebsite: form.billingWebsite.trim(),
      })
      showToast(t('saved'), 'success')
    } catch (error) {
      const key = mapSettingsError(error, 'save')
      showToast(key === 'raw' ? (error as ApiError).message : t(`errors.${key}`), 'error')
    }
  }, [clearToast, form, saving, showToast, t, updateMutation])

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
            {t('subtitle')}
          </p>
        </div>
      </DashboardPanel>

      {toast ? (
        <DashboardToast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
      ) : null}

      {loading ? (
        <DashboardPanel as="section" className="px-4 py-8 sm:px-6 md:px-7">
          <p className="flex items-center gap-2 text-sm text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </p>
        </DashboardPanel>
      ) : loadError ? (
        <DashboardPanel as="section" className="space-y-3 px-4 py-8 sm:px-6 md:px-7">
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(null)
              void settingsQuery.refetch()
            }}
          >
            {t('retry')}
          </Button>
        </DashboardPanel>
      ) : form && live ? (
        <form
          className="flex flex-col gap-5 sm:gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2 xl:gap-6">
            <SettingsSection
              title={t('sections.platformBranding.title')}
              description={t('sections.platformBranding.description')}
            >
              <SettingRow
                label={t('fields.platformName')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  id={`${formId}-platform-name`}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.platformName}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, platformName: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.primaryDomain')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.primaryDomain}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, primaryDomain: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.supportEmail')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  type="email"
                  className={fieldClassName}
                  disabled={saving}
                  value={form.supportEmail}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, supportEmail: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              title={t('sections.invoiceBilling.title')}
              description={t('sections.invoiceBilling.description')}
            >
              <SettingRow
                label={t('fields.billingBrandName')}
                state={form.billingBrandName.trim() ? 'enabled' : 'disabled'}
                stateLabel={form.billingBrandName.trim() ? t('states.enabled') : t('states.notConfigured')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingBrandName}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingBrandName: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingLegalName')}
                state={form.billingLegalName.trim() ? 'enabled' : 'disabled'}
                stateLabel={form.billingLegalName.trim() ? t('states.enabled') : t('states.notConfigured')}
                striped
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingLegalName}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingLegalName: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingTagline')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingTagline}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingTagline: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingAddress')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <textarea
                  className={cn(fieldClassName, 'h-24 py-2')}
                  disabled={saving}
                  value={form.billingAddress}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingAddress: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingGstin')}
                state={form.billingGstin.trim() ? 'enabled' : 'disabled'}
                stateLabel={form.billingGstin.trim() ? t('states.enabled') : t('states.notConfigured')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  maxLength={15}
                  value={form.billingGstin}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingGstin: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingEmail')}
                state={form.billingEmail.trim() ? 'enabled' : 'disabled'}
                stateLabel={form.billingEmail.trim() ? t('states.enabled') : t('states.notConfigured')}
                striped
              >
                <input
                  type="email"
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingEmail}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingEmail: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingPhone')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingPhone}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingPhone: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.billingWebsite')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.billingWebsite}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, billingWebsite: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              title={t('sections.authentication.title')}
              description={t('sections.authentication.description')}
            >
              <SettingRow
                label={t('fields.sessionTimeout')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  type="number"
                  min={1}
                  max={168}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.sessionTimeoutHours}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, sessionTimeoutHours: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.mfaEnforcement')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <select
                  className={fieldClassName}
                  disabled={saving}
                  value={form.mfaEnforcement}
                  onChange={(event) =>
                    patchForm((prev) => ({
                      ...prev,
                      mfaEnforcement: event.target.value as PlatformMfaEnforcement,
                    }))
                  }
                >
                  {MFA_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`mfaOptions.${option}`)}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label={t('fields.passwordPolicy')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  type="number"
                  min={8}
                  max={128}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.passwordMinLength}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, passwordMinLength: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t('sections.smtp.title')} description={t('sections.smtp.description')}>
              <SettingRow
                label={t('fields.provider')}
                state={live.smtpHostConfigured || live.smtpPasswordConfigured ? 'enabled' : 'disabled'}
                stateLabel={t(
                  live.smtpHostConfigured || live.smtpPasswordConfigured
                    ? 'states.enabled'
                    : 'states.disabled'
                )}
              >
                <p className="break-all text-sm text-body">{live.smtpMailer}</p>
              </SettingRow>
              <SettingRow
                label={t('fields.fromAddress')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <p className="break-all text-sm text-body">{live.smtpFromAddress}</p>
              </SettingRow>
              <SettingRow
                label={t('fields.dailyLimit')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  type="number"
                  min={0}
                  max={10_000_000}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.smtpDailyLimit}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, smtpDailyLimit: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t('sections.oauth.title')} description={t('sections.oauth.description')}>
              <SettingRow
                label={t('fields.googleSignIn')}
                state={form.googleSignInEnabled ? 'enabled' : 'disabled'}
                stateLabel={t(form.googleSignInEnabled ? 'states.enabled' : 'states.disabled')}
              >
                <label className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-dash-border-strong text-primary"
                    checked={form.googleSignInEnabled}
                    disabled={saving}
                    onChange={(event) =>
                      patchForm((prev) => ({ ...prev, googleSignInEnabled: event.target.checked }))
                    }
                  />
                  {t(live.googleSignInConfigured ? 'presence.configured' : 'presence.notConfigured')}
                </label>
              </SettingRow>
              <SettingRow
                label={t('fields.microsoftSignIn')}
                state={form.microsoftSignInEnabled ? 'enabled' : 'disabled'}
                stateLabel={t(form.microsoftSignInEnabled ? 'states.enabled' : 'states.disabled')}
                striped
              >
                <label className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-dash-border-strong text-primary"
                    checked={form.microsoftSignInEnabled}
                    disabled={saving}
                    onChange={(event) =>
                      patchForm((prev) => ({
                        ...prev,
                        microsoftSignInEnabled: event.target.checked,
                      }))
                    }
                  />
                  {t(
                    live.microsoftSignInConfigured ? 'presence.configured' : 'presence.notConfigured'
                  )}
                </label>
              </SettingRow>
              <SettingRow
                label={t('fields.redirectUrl')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.oauthRedirectUrl}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, oauthRedirectUrl: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              title={t('sections.maintenanceMode.title')}
              description={t('sections.maintenanceMode.description')}
            >
              <SettingRow
                label={t('fields.currentState')}
                state={form.maintenanceEnabled ? 'enabled' : 'disabled'}
                stateLabel={t(form.maintenanceEnabled ? 'states.enabled' : 'states.disabled')}
              >
                <label className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-dash-border-strong text-primary"
                    checked={form.maintenanceEnabled}
                    disabled={saving}
                    onChange={(event) =>
                      patchForm((prev) => ({ ...prev, maintenanceEnabled: event.target.checked }))
                    }
                  />
                  {t(form.maintenanceEnabled ? 'presence.on' : 'presence.off')}
                </label>
              </SettingRow>
              <SettingRow
                label={t('fields.allowlistedIps')}
                state={form.allowlistedIps.trim() ? 'enabled' : 'disabled'}
                stateLabel={t(form.allowlistedIps.trim() ? 'states.enabled' : 'states.disabled')}
                striped
              >
                <textarea
                  className={cn(fieldClassName, 'h-auto min-h-20 resize-y py-2')}
                  disabled={saving}
                  value={form.allowlistedIps}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, allowlistedIps: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.nextWindow')}
                state={form.nextMaintenanceWindow ? 'scheduled' : 'disabled'}
                stateLabel={t(form.nextMaintenanceWindow ? 'states.scheduled' : 'states.disabled')}
              >
                <input
                  type="datetime-local"
                  className={fieldClassName}
                  disabled={saving}
                  value={form.nextMaintenanceWindow}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, nextMaintenanceWindow: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              title={t('sections.platformConfiguration.title')}
              description={t('sections.platformConfiguration.description')}
            >
              <SettingRow
                label={t('fields.defaultTimezone')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  className={fieldClassName}
                  disabled={saving}
                  value={form.defaultTimezone}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, defaultTimezone: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.dataRetention')}
                state="enabled"
                stateLabel={t('states.enabled')}
                striped
              >
                <input
                  type="number"
                  min={1}
                  max={3650}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.dataRetentionDays}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, dataRetentionDays: event.target.value }))
                  }
                />
              </SettingRow>
              <SettingRow
                label={t('fields.apiRateLimit')}
                state="enabled"
                stateLabel={t('states.enabled')}
              >
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  className={fieldClassName}
                  disabled={saving}
                  value={form.apiRateLimitPerMinute}
                  onChange={(event) =>
                    patchForm((prev) => ({ ...prev, apiRateLimitPerMinute: event.target.value }))
                  }
                />
              </SettingRow>
            </SettingsSection>
          </div>

          <DashboardPanel
            as="div"
            className="sticky bottom-0 z-10 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
          >
            <p className="text-xs leading-5 text-mute sm:max-w-md">{t('saveFooterHint')}</p>
            <Button type="submit" size="sm" className="w-full gap-2 sm:w-auto" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {saving ? t('saving') : t('save')}
            </Button>
          </DashboardPanel>
        </form>
      ) : null}
    </div>
  )
}
