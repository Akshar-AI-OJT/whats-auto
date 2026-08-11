'use client'

import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Globe, Loader2, Mail, MapPin, Phone, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  api,
  type ApiError,
  type OrganizationDetails,
  type OrganizationSummary,
  type UpdateOrganizationBody,
} from '@/lib/api'
import {
  getTimezoneOptions,
  isValidPhone,
  ORG_SETUP_PATH,
} from '@/lib/onboarding'
import {
  INDUSTRY_OPTIONS,
  type IndustryOption,
} from '@/components/onboarding/organization-wizard-types'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  authInputClassName,
  authInputWithIconClassName,
} from '@/components/auth/auth-field-styles'
import { OwnershipTransferSection } from '@/components/dashboard/settings/OwnershipTransferSection'
import { useRouter } from '@/i18n/navigation'

/** Matches PATCH /api/v1/organizations/:id body (updateOrganizationValidator). */
const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'] as const
const NAME_MIN = 2
const NAME_MAX = 200
const CURRENCY_MAX = 10

const selectClassName = cn(
  authInputClassName,
  'h-11 w-full appearance-none rounded-xl px-3.5 text-sm text-ink outline-none'
)

const readOnlyInputClassName = cn(authInputWithIconClassName, 'bg-dash-surface/70 text-body')

type FormState = {
  name: string
  phone: string
  website: string
  industry: string
  timezone: string
  currency: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

function detailsFromOrg(org: OrganizationSummary | null): FormState {
  return {
    name: org?.name ?? '',
    phone: org?.phone ?? '',
    website: org?.website ?? '',
    industry: org?.industry ?? '',
    timezone: org?.timezone || getTimezoneOptions()[0] || 'UTC',
    currency: org?.currency || 'INR',
  }
}

function unwrapDetails(
  data: ({ data?: OrganizationDetails } & OrganizationDetails) | undefined
): OrganizationDetails | null {
  if (!data) return null
  return data.data ?? (data.id ? data : null)
}

function isValidWebsite(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return Boolean(url.hostname.includes('.'))
  } catch {
    return false
  }
}

/** Vine `.url()` requires a scheme — normalize before send. */
function normalizeWebsite(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function buildUpdateBody(form: FormState): UpdateOrganizationBody {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || undefined,
    website: normalizeWebsite(form.website),
    industry: form.industry.trim() || undefined,
    timezone: form.timezone.trim(),
    currency: form.currency.trim().slice(0, CURRENCY_MAX) || undefined,
  }
}

function RequiredMark({ label }: { label: string }) {
  return (
    <>
      {label}{' '}
      <span className="text-negative" aria-hidden>
        *
      </span>
    </>
  )
}

export function WorkspaceSettingsPage() {
  const t = useTranslations('dashboard.settings')
  const tIndustries = useTranslations('onboarding.organization.step2.industries')
  const router = useRouter()
  const {
    activeOrganization,
    activeOrganizationId,
    hasOrganizations,
    canManageSettings,
    canDeleteOrganization,
    isLoading: orgsLoading,
    refresh,
  } = useOrganizations()

  const [form, setForm] = useState<FormState>(() => detailsFromOrg(activeOrganization))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const nameId = useId()
  const phoneId = useId()
  const websiteId = useId()
  const industryId = useId()
  const timezoneId = useId()
  const currencyId = useId()
  const slugId = useId()
  const emailId = useId()
  const countryId = useId()
  const formErrorId = useId()
  const successId = useId()
  const timezones = Array.from(
    new Set([form.timezone, ...getTimezoneOptions()].filter(Boolean))
  )
  const currencies = Array.from(
    new Set([form.currency, ...CURRENCY_OPTIONS].filter(Boolean))
  ) as string[]

  useEffect(() => {
    setForm(detailsFromOrg(activeOrganization))
    setFieldErrors({})
    setError(null)
    setSuccess(null)
  }, [activeOrganization])

  function patchForm(next: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...next }))
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    const name = form.name.trim()
    if (!name || name.length < NAME_MIN) {
      next.name = t('errors.nameRequired')
    } else if (name.length > NAME_MAX) {
      next.name = t('errors.nameTooLong')
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      next.phone = t('errors.phoneInvalid')
    }
    if (form.website.trim() && !isValidWebsite(form.website)) {
      next.website = t('errors.websiteInvalid')
    }
    if (!form.timezone.trim()) {
      next.timezone = t('errors.timezoneRequired')
    }
    if (form.currency.trim().length > CURRENCY_MAX) {
      next.currency = t('errors.currencyInvalid')
    }
    return next
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!activeOrganizationId) {
      setError(t('errors.noWorkspace'))
      return
    }
    if (!canManageSettings) {
      setError(t('errors.permissionDenied'))
      return
    }

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      const { data } = await api.organizations.update(
        activeOrganizationId,
        buildUpdateBody(form)
      )

      const updated = unwrapDetails(data)
      if (updated) {
        setForm({
          name: updated.name,
          phone: updated.phone ?? '',
          website: updated.website ?? '',
          industry: updated.industry ?? '',
          timezone: updated.timezone,
          currency: updated.currency || 'INR',
        })
      }

      await refresh()
      setSuccess(t('saved'))
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.status === 401) {
        setError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }
      if (apiError.status === 403) {
        setError(t('errors.permissionDenied'))
        return
      }
      setError(apiError.message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (!activeOrganizationId || !canDeleteOrganization) return

    setDeleteError(null)
    setDeletePending(true)
    try {
      await api.organizations.destroy(activeOrganizationId)
      setDeleteOpen(false)
      const next = await refresh()
      if (next.organizations.length === 0) {
        router.push(ORG_SETUP_PATH)
      } else {
        const nextActiveId = next.activeId ?? next.organizations[0]?.id
        if (nextActiveId) {
          await api.organizations.setActive(nextActiveId)
          await refresh()
        }
        router.push('/dashboard')
      }
      router.refresh()
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.status === 401) {
        setDeleteError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }
      if (apiError.status === 403) {
        setDeleteError(t('errors.permissionDenied'))
        return
      }
      setDeleteError(apiError.message || t('errors.generic'))
    } finally {
      setDeletePending(false)
    }
  }

  if (orgsLoading) {
    return (
      <DashboardPanel as="section" className="px-4 py-10 sm:px-6">
        <p className="flex items-center justify-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </p>
      </DashboardPanel>
    )
  }

  if (!hasOrganizations || !activeOrganization) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">{t('emptyDescription')}</p>
          <Button
            type="button"
            className="mt-5"
            onClick={() => router.push(ORG_SETUP_PATH)}
          >
            {t('emptyAction')}
          </Button>
        </DashboardPanel>
      </div>
    )
  }

  const readOnly = !canManageSettings
  const org = activeOrganization

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
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

      {/* Immutable identity — returned by GET list / PATCH response; not in update body */}
      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('identityTitle')}
          description={t('identityDescription')}
        />
        <FieldGroup className="mt-5 gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field className="gap-2">
              <FieldLabel htmlFor={slugId} className="text-sm font-medium text-ink">
                {t('fields.slug')}
              </FieldLabel>
              <Input
                id={slugId}
                name="slug"
                type="text"
                readOnly
                disabled
                value={org.slug}
                className={cn(authInputClassName, 'bg-dash-surface/70 text-body')}
              />
              <FieldDescription className="text-xs text-mute">
                {t('fields.slugHint')}
              </FieldDescription>
            </Field>

            <Field className="gap-2">
              <FieldLabel htmlFor={emailId} className="text-sm font-medium text-ink">
                {t('fields.email')}
              </FieldLabel>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={emailId}
                  name="email"
                  type="email"
                  readOnly
                  disabled
                  value={org.email}
                  className={readOnlyInputClassName}
                />
              </div>
              <FieldDescription className="text-xs text-mute">
                {t('fields.emailHint')}
              </FieldDescription>
            </Field>
          </div>

          <Field className="gap-2 sm:max-w-md">
            <FieldLabel htmlFor={countryId} className="text-sm font-medium text-ink">
              {t('fields.country')}
            </FieldLabel>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={countryId}
                name="country"
                type="text"
                readOnly
                disabled
                value={org.country ?? ''}
                className={readOnlyInputClassName}
              />
            </div>
            <FieldDescription className="text-xs text-mute">
              {t('fields.countryHint')}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('detailsTitle')}
          description={t('detailsDescription')}
        />

        {readOnly ? (
          <p className="mt-4 rounded-xl border border-dash-border bg-dash-surface/60 px-3.5 py-3 text-sm text-body">
            {t('readOnlyNotice')}
          </p>
        ) : null}

        <form className="mt-5 flex flex-col gap-5" onSubmit={handleSave} noValidate>
          <FieldGroup className="gap-5">
            <Field data-invalid={fieldErrors.name ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={nameId} className="text-sm font-medium text-ink">
                <RequiredMark label={t('fields.name')} />
              </FieldLabel>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={nameId}
                  name="name"
                  type="text"
                  autoComplete="organization"
                  required
                  maxLength={NAME_MAX}
                  disabled={pending || readOnly}
                  value={form.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-required
                  className={authInputWithIconClassName}
                  onChange={(e) => {
                    patchForm({ name: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, name: undefined }))
                    setSuccess(null)
                  }}
                />
              </div>
              <FieldDescription className="text-xs text-mute">
                {t('fields.nameHint')}
              </FieldDescription>
              {fieldErrors.name ? (
                <FieldError className="text-xs text-negative">{fieldErrors.name}</FieldError>
              ) : null}
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field data-invalid={fieldErrors.phone ? true : undefined} className="gap-2">
                <FieldLabel htmlFor={phoneId} className="text-sm font-medium text-ink">
                  {t('fields.phone')}
                </FieldLabel>
                <div className="relative">
                  <Phone
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                    aria-hidden
                  />
                  <Input
                    id={phoneId}
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    disabled={pending || readOnly}
                    value={form.phone}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    className={authInputWithIconClassName}
                    onChange={(e) => {
                      patchForm({ phone: e.target.value })
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }))
                      setSuccess(null)
                    }}
                  />
                </div>
                <FieldDescription className="text-xs text-mute">
                  {t('fields.phoneHint')}
                </FieldDescription>
                {fieldErrors.phone ? (
                  <FieldError className="text-xs text-negative">{fieldErrors.phone}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={fieldErrors.website ? true : undefined} className="gap-2">
                <FieldLabel htmlFor={websiteId} className="text-sm font-medium text-ink">
                  {t('fields.website')}
                </FieldLabel>
                <div className="relative">
                  <Globe
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                    aria-hidden
                  />
                  <Input
                    id={websiteId}
                    name="website"
                    type="url"
                    autoComplete="url"
                    placeholder={t('fields.websitePlaceholder')}
                    disabled={pending || readOnly}
                    value={form.website}
                    aria-invalid={Boolean(fieldErrors.website)}
                    className={authInputWithIconClassName}
                    onChange={(e) => {
                      patchForm({ website: e.target.value })
                      setFieldErrors((prev) => ({ ...prev, website: undefined }))
                      setSuccess(null)
                    }}
                  />
                </div>
                <FieldDescription className="text-xs text-mute">
                  {t('fields.websiteHint')}
                </FieldDescription>
                {fieldErrors.website ? (
                  <FieldError className="text-xs text-negative">{fieldErrors.website}</FieldError>
                ) : null}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field className="gap-2">
                <FieldLabel htmlFor={industryId} className="text-sm font-medium text-ink">
                  {t('fields.industry')}
                </FieldLabel>
                <select
                  id={industryId}
                  name="industry"
                  disabled={pending || readOnly}
                  value={form.industry}
                  className={selectClassName}
                  onChange={(e) => {
                    patchForm({ industry: e.target.value })
                    setSuccess(null)
                  }}
                >
                  <option value="">{t('fields.industryPlaceholder')}</option>
                  {form.industry &&
                  !INDUSTRY_OPTIONS.includes(form.industry as IndustryOption) ? (
                    <option value={form.industry}>{form.industry}</option>
                  ) : null}
                  {INDUSTRY_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {tIndustries(value as IndustryOption)}
                    </option>
                  ))}
                </select>
                <FieldDescription className="text-xs text-mute">
                  {t('fields.industryHint')}
                </FieldDescription>
              </Field>

              <Field
                data-invalid={fieldErrors.timezone ? true : undefined}
                className="gap-2"
              >
                <FieldLabel htmlFor={timezoneId} className="text-sm font-medium text-ink">
                  <RequiredMark label={t('fields.timezone')} />
                </FieldLabel>
                <select
                  id={timezoneId}
                  name="timezone"
                  required
                  disabled={pending || readOnly}
                  value={form.timezone}
                  aria-invalid={Boolean(fieldErrors.timezone)}
                  aria-required
                  className={selectClassName}
                  onChange={(e) => {
                    patchForm({ timezone: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, timezone: undefined }))
                    setSuccess(null)
                  }}
                >
                  {timezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                {fieldErrors.timezone ? (
                  <FieldError className="text-xs text-negative">
                    {fieldErrors.timezone}
                  </FieldError>
                ) : null}
              </Field>
            </div>

            <Field
              data-invalid={fieldErrors.currency ? true : undefined}
              className="gap-2 sm:max-w-xs"
            >
              <FieldLabel htmlFor={currencyId} className="text-sm font-medium text-ink">
                {t('fields.currency')}
              </FieldLabel>
              <select
                id={currencyId}
                name="currency"
                disabled={pending || readOnly}
                value={form.currency}
                aria-invalid={Boolean(fieldErrors.currency)}
                className={selectClassName}
                onChange={(e) => {
                  patchForm({ currency: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, currency: undefined }))
                  setSuccess(null)
                }}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <FieldDescription className="text-xs text-mute">
                {t('fields.currencyHint')}
              </FieldDescription>
              {fieldErrors.currency ? (
                <FieldError className="text-xs text-negative">{fieldErrors.currency}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <p
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-negative/30 bg-negative/5 px-3.5 py-3 text-sm text-negative"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              id={successId}
              role="status"
              className="rounded-xl border border-primary/30 bg-primary-pale/50 px-3.5 py-3 text-sm text-positive-deep"
            >
              {success}
            </p>
          ) : null}

          {!readOnly ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={pending} className="min-w-[8.5rem] gap-2">
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('saving')}
                  </>
                ) : (
                  t('save')
                )}
              </Button>
            </div>
          ) : null}
        </form>
      </DashboardPanel>

      <OwnershipTransferSection />

      {canDeleteOrganization ? (
        <DashboardPanel as="section" className="border-negative/25 p-4 sm:p-5 md:p-6">
          <DashboardSectionHeader
            title={t('dangerTitle')}
            description={t('dangerDescription')}
          />
          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-negative/40 text-negative hover:bg-negative/5 hover:text-negative"
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('deleteCta')}
            </Button>
          </div>
        </DashboardPanel>
      ) : null}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!deletePending) setDeleteOpen(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            aria-describedby="delete-workspace-desc"
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-workspace-title"
              className="font-display text-lg tracking-tight text-ink"
            >
              {t('deleteConfirmTitle')}
            </h2>
            <p id="delete-workspace-desc" className="mt-2 text-sm leading-6 text-body">
              {t('deleteConfirmBody', { name: activeOrganization.name })}
            </p>

            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={deletePending}
                onClick={() => setDeleteOpen(false)}
              >
                {t('deleteCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                className="gap-2"
                onClick={handleDelete}
              >
                {deletePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('deleting')}
                  </>
                ) : (
                  t('deleteConfirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
