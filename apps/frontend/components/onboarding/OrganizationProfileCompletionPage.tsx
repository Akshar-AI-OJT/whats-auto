'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Globe,
  Headset,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Upload,
} from 'lucide-react'
import { Link, useRouter } from '@/i18n/navigation'
import { api, type ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  ORGANIZATION_TYPE_OPTIONS,
  type CompanySizeOption,
  type IndustryOption,
  type OrganizationTypeOption,
} from '@/components/onboarding/organization-wizard-types'
import { RequiredAsterisk } from '@/components/onboarding/required-asterisk'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  authFloatingCardClassName,
  authInputClassName,
  authInputWithIconClassName,
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  clearPendingWorkspacePreferences,
  isValidEmail,
  isValidPhone,
  isValidWebsiteUrl,
  readPendingWorkspacePreferences,
} from '@/lib/onboarding'
import {
  buildOrganizationProfileUpdateBody,
  calculateOrganizationProfileCompletion,
  formatOrganizationAddressLines,
  organizationToProfileFormValues,
  type OrganizationProfileFormValues,
} from '@/lib/organization-profile'
import { cn } from '@/lib/utils'

const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
const DESCRIPTION_MAX = 500

type ProfileStep = 1 | 2 | 3 | 4

type FieldErrors = Partial<Record<keyof OrganizationProfileFormValues | 'logo' | 'confirm', string>>

function selectClassName(invalid?: boolean) {
  return cn(
    authInputClassName,
    'h-11 w-full cursor-pointer appearance-none rounded-xl px-3.5 text-sm text-ink outline-none',
    invalid && 'border-negative'
  )
}

function buildInitialProfileValues(
  org: Parameters<typeof organizationToProfileFormValues>[0]
): OrganizationProfileFormValues {
  const prefs = readPendingWorkspacePreferences()
  const base = organizationToProfileFormValues(org)
  const companySize = prefs?.companySize?.trim()
  const defaultLanguage = prefs?.defaultLanguage?.trim()
  return {
    ...base,
    businessSize:
      base.businessSize ||
      (COMPANY_SIZE_OPTIONS.includes(companySize as CompanySizeOption)
        ? (companySize as string)
        : ''),
    defaultLanguage: base.defaultLanguage || defaultLanguage || '',
  }
}

export function OrganizationProfileCompletionPage() {
  const t = useTranslations('onboarding.organizationProfile')
  const tOrg = useTranslations('onboarding.organization')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    activeOrganization,
    organizations,
    isLoading: orgsLoading,
    isResolvingAccess,
    refresh,
    isOwner,
    accessContext,
  } = useOrganizations()

  const org = activeOrganization ?? organizations[0] ?? null
  const orgId = org?.id ?? null

  useEffect(() => {
    if (orgsLoading || isResolvingAccess || !accessContext) return
    if (!isOwner) {
      router.replace('/dashboard')
    }
  }, [accessContext, isOwner, isResolvingAccess, orgsLoading, router])

  const [hydratedOrgId, setHydratedOrgId] = useState<string | null>(null)
  const [step, setStep] = useState<ProfileStep>(1)
  const [values, setValues] = useState<OrganizationProfileFormValues | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const submitLockRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formErrorId = useId()
  const confirmId = useId()

  if (org && orgId !== hydratedOrgId) {
    setHydratedOrgId(orgId)
    setValues(buildInitialProfileValues(org))
    setStep(1)
    setConfirmed(false)
    setFieldErrors({})
    setFormError(null)
    setSuccess(false)
  }

  useEffect(() => {
    return () => {
      if (logoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(logoPreviewUrl)
    }
  }, [logoPreviewUrl])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.media.organizationLogo()
        const root = data as { data?: { id?: string; deliveryUrl?: string | null; state?: string } | null }
        const logo = root.data === undefined ? (data as { id?: string; deliveryUrl?: string | null; state?: string } | null) : root.data
        if (cancelled || !logo?.id || logo.state !== 'ready') return
        setLogoPreviewUrl(logo.deliveryUrl ?? null)
        setValues((prev) => (prev ? { ...prev, hasLogo: true } : prev))
      } catch {
        /* no logo yet */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const completion = useMemo(
    () => (values ? calculateOrganizationProfileCompletion(values) : null),
    [values]
  )

  function patchValues(patch: Partial<OrganizationProfileFormValues>) {
    setValues((prev) => (prev ? { ...prev, ...patch } : prev))
    setFieldErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch) as Array<keyof OrganizationProfileFormValues>) {
        delete next[key]
      }
      return next
    })
  }

  function validateStep(current: ProfileStep): boolean {
    if (!values) return false
    const next: FieldErrors = {}

    if (current === 1) {
      if (!values.name.trim() || values.name.trim().length < 2) {
        next.name = t('errors.nameRequired')
      }
      if (!isValidEmail(values.email)) next.email = t('errors.emailInvalid')
      if (values.phone.trim() && !isValidPhone(values.phone)) {
        next.phone = t('errors.phoneInvalid')
      }
      if (values.alternatePhone.trim() && !isValidPhone(values.alternatePhone)) {
        next.alternatePhone = t('errors.phoneInvalid')
      }
      if (values.website.trim() && !isValidWebsiteUrl(values.website)) {
        next.website = t('errors.websiteInvalid')
      }
      if (!values.industry.trim()) next.industry = t('errors.industryRequired')
    }

    if (current === 2) {
      if (!values.businessSize.trim()) next.businessSize = t('errors.businessSizeRequired')
      if (values.description.length > DESCRIPTION_MAX) {
        next.description = t('errors.descriptionTooLong')
      }
    }

    if (current === 3) {
      if (!values.addressLine1.trim()) next.addressLine1 = t('errors.addressLine1Required')
      if (!values.city.trim()) next.city = t('errors.cityRequired')
      if (!values.state.trim()) next.state = t('errors.stateRequired')
      if (!values.postalCode.trim()) next.postalCode = t('errors.postalCodeRequired')
      if (!values.country.trim()) next.country = t('errors.countryRequired')
    }

    if (current === 4) {
      const result = calculateOrganizationProfileCompletion(values)
      if (!result.requiredComplete) {
        next.confirm = t('errors.requiredIncomplete')
      }
      if (!confirmed) next.confirm = t('errors.confirmRequired')
    }

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleLogoFile(file: File | null) {
    if (!file || !org?.id || !values) return
    setFormError(null)

    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, logo: t('errors.logoType') }))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setFieldErrors((prev) => ({ ...prev, logo: t('errors.logoSize') }))
      return
    }

    setLogoUploading(true)
    try {
      const { data: body } = await api.media.initiateUpload({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        purpose: 'organization_logo',
      })
      const root = body as {
        data?: { asset?: { id: string; deliveryUrl?: string | null }; upload?: { url: string; headers?: Record<string, string> } }
        asset?: { id: string; deliveryUrl?: string | null }
        upload?: { url: string; headers?: Record<string, string> }
      }
      const payload = root.data ?? root
      const asset = payload.asset
      const upload = payload.upload
      if (!asset?.id || !upload?.url) throw new Error(t('errors.logoUploadFailed'))

      const put = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers ?? {},
        body: file,
      })
      if (!put.ok) throw new Error(t('errors.logoUploadFailed'))

      const completed = await api.media.completeUpload(asset.id)
      const completedRoot = completed.data as {
        data?: { deliveryUrl?: string | null }
        deliveryUrl?: string | null
      }
      const deliveryUrl =
        completedRoot.data?.deliveryUrl ?? completedRoot.deliveryUrl ?? asset.deliveryUrl ?? null

      if (logoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(logoPreviewUrl)
      const localPreview = URL.createObjectURL(file)
      setLogoPreviewUrl(deliveryUrl || localPreview)
      patchValues({ hasLogo: true })
      await queryClient.invalidateQueries({ queryKey: ['organization-logo'] })
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.logo
        return next
      })
    } catch (err) {
      setFormError((err as ApiError)?.message || t('errors.logoUploadFailed'))
    } finally {
      setLogoUploading(false)
    }
  }

  async function persistProfile(): Promise<boolean> {
    if (!org?.id || !values || submitLockRef.current) return false
    submitLockRef.current = true
    setSaving(true)
    setFormError(null)
    try {
      const body = buildOrganizationProfileUpdateBody(values)
      await api.organizations.update(org.id, body)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all }),
        refresh(),
      ])
      return true
    } catch (err) {
      setFormError((err as ApiError)?.message || t('errors.saveFailed'))
      return false
    } finally {
      submitLockRef.current = false
      setSaving(false)
    }
  }

  async function handleContinue() {
    if (!validateStep(step)) return
    if (step < 4) {
      setStep((prev) => (prev + 1) as ProfileStep)
      return
    }
    const ok = await persistProfile()
    if (ok) {
      clearPendingWorkspacePreferences()
      setSuccess(true)
    }
  }

  function handleBack() {
    setFormError(null)
    if (step === 1) {
      // Only leave when required setup is already satisfied (optional follow-up visit).
      if (completion?.requiredComplete) {
        router.push('/dashboard')
      }
      return
    }
    setStep((prev) => (prev - 1) as ProfileStep)
  }

  const steps = [
    { id: 1 as const, title: t('steps.organization.title'), description: t('steps.organization.description') },
    { id: 2 as const, title: t('steps.business.title'), description: t('steps.business.description') },
    { id: 3 as const, title: t('steps.address.title'), description: t('steps.address.description') },
    { id: 4 as const, title: t('steps.review.title'), description: t('steps.review.description') },
  ]

  if (orgsLoading || !values) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#F8FAFC] text-sm text-body">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-4 text-center">
        <p className="text-sm text-body">{t('errors.noOrganization')}</p>
        <Button type="button" className="cursor-pointer" onClick={() => router.push('/onboarding/organization')}>
          {t('actions.createOrganization')}
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-svh flex-col bg-canvas">
        <ProfileTopBar />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <span
            className={cn(
              'flex size-[4.5rem] items-center justify-center rounded-full bg-primary text-on-primary',
              'shadow-[0_10px_28px_rgb(37_99_235/0.35)]'
            )}
            aria-hidden
          >
            <Check className="size-9 stroke-[3]" />
          </span>
          <h1 className="mt-8 text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">
            {t('success.title')}
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-6 text-[#64748B]">
            {t('success.subtitle')}
          </p>
          {completion ? (
            <p className="mt-4 text-sm text-[#94A3B8]">
              {t('success.completion', { percent: completion.percent })}
            </p>
          ) : null}
          <Button
            type="button"
            className={cn(
              authPrimaryButtonClassName,
              'mt-8 h-12 w-full max-w-[17.5rem] gap-2 rounded-full px-8 text-[15px] font-semibold',
              'shadow-[0_8px_24px_rgb(37_99_235/0.4)]',
              'hover:shadow-[0_12px_28px_rgb(37_99_235/0.45)]'
            )}
            onClick={() => router.replace('/dashboard')}
          >
            {t('success.cta')}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="light-locked auth-palette min-h-svh bg-[#F8FAFC]">
      <ProfileTopBar />

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:gap-6 sm:px-6 lg:grid-cols-[minmax(15.5rem,17.5rem)_minmax(0,1fr)] lg:items-start lg:gap-7 lg:py-8">
        <aside className={cn(authFloatingCardClassName, 'p-5 sm:p-6')}>
          <h1 className="font-display text-[1.35rem] leading-7 tracking-tight text-ink sm:text-[1.5rem] sm:leading-8">
            {t('sidebar.title')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-pretty text-body">{t('sidebar.subtitle')}</p>

          <ol className="mt-7 flex flex-col gap-5">
            {steps.map((item) => {
              const done = step > item.id
              const active = step === item.id
              return (
                <li key={item.id} className="flex gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                      done && 'bg-primary text-on-primary',
                      active && !done && 'bg-primary text-on-primary ring-4 ring-primary/20',
                      !done && !active && 'border border-[#E2E8F0] bg-canvas text-mute'
                    )}
                    aria-current={active ? 'step' : undefined}
                  >
                    {done ? <Check className="size-3.5 stroke-[2.5]" aria-hidden /> : item.id}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span
                      className={cn(
                        'block text-sm font-semibold leading-5',
                        active || done ? 'text-ink' : 'text-mute'
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-mute">
                      {item.description}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>

          {completion ? (
            <div className="mt-8 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink">
                <span>{t('sidebar.completionLabel')}</span>
                <span className="tabular-nums text-positive-deep">{completion.percent}%</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-active transition-[width] duration-300"
                  style={{ width: `${completion.percent}%` }}
                />
              </div>
            </div>
          ) : null}
        </aside>

        <section className={cn(authFloatingCardClassName, 'p-5 sm:p-7 lg:p-8')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-left">
              <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
                {steps[step - 1]?.title}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-pretty text-body">
                {steps[step - 1]?.description}
              </p>
            </div>
            <span className="shrink-0 pt-1 text-xs font-semibold tracking-wide text-positive-deep">
              {t('stepBadge', { step, total: 4 })}
            </span>
          </div>

          {formError ? (
            <div
              role="alert"
              id={formErrorId}
              className="mt-5 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
            >
              {formError}
            </div>
          ) : null}

          <div className="mt-6">
            {step === 1 ? (
              <StepOrganizationDetails
                values={values}
                errors={fieldErrors}
                logoPreviewUrl={logoPreviewUrl}
                logoUploading={logoUploading}
                fileInputRef={fileInputRef}
                onChange={patchValues}
                onPickLogo={() => fileInputRef.current?.click()}
                onLogoSelected={(file) => void handleLogoFile(file)}
                t={t}
                tOrg={tOrg}
              />
            ) : null}

            {step === 2 ? (
              <StepBusinessInformation
                values={values}
                errors={fieldErrors}
                onChange={patchValues}
                t={t}
                tOrg={tOrg}
              />
            ) : null}

            {step === 3 ? (
              <StepAddress values={values} errors={fieldErrors} onChange={patchValues} t={t} />
            ) : null}

            {step === 4 ? (
              <StepReview
                values={values}
                logoPreviewUrl={logoPreviewUrl}
                confirmed={confirmed}
                confirmId={confirmId}
                confirmError={fieldErrors.confirm}
                onConfirmChange={setConfirmed}
                onEdit={setStep}
                t={t}
                tOrg={tOrg}
              />
            ) : null}
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Button
              type="button"
              variant="outline"
              className={cn(authOutlineButtonClassName, 'h-12 w-full gap-2 sm:w-auto sm:min-w-[7.5rem]')}
              onClick={handleBack}
              disabled={saving || logoUploading}
            >
              {step === 1 ? (
                t('actions.cancel')
              ) : (
                <>
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('actions.back')}
                </>
              )}
            </Button>

            <Button
              type="button"
              className={cn(authPrimaryButtonClassName, 'h-12 w-full gap-2 sm:w-auto sm:min-w-[12rem]')}
              onClick={() => void handleContinue()}
              disabled={
                saving ||
                logoUploading ||
                (step === 4 && (!confirmed || !completion?.requiredComplete))
              }
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('actions.saving')}
                </>
              ) : step === 4 ? (
                <>
                  <Check className="size-4" aria-hidden />
                  {t('actions.completeSetup')}
                </>
              ) : (
                <>
                  {t('actions.continue')}
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}

function ProfileTopBar() {
  const t = useTranslations('onboarding.organizationProfile')
  return (
    <header className="border-b border-[#E2E8F0] bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="w-fit cursor-pointer font-display text-xl leading-none text-ink transition-opacity hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:text-[1.35rem]"
        >
          Whats-Auto
        </Link>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="hidden text-sm text-mute sm:inline">{t('help.needHelp')}</span>
          <Link
            href="/contact"
            className={cn(
              authOutlineButtonClassName,
              'inline-flex h-9 w-auto items-center gap-2 px-3 text-sm font-semibold text-ink'
            )}
          >
            <Headset className="size-4" aria-hidden />
            {t('help.contactSupport')}
          </Link>
        </div>
      </div>
    </header>
  )
}

type StepProps = {
  values: OrganizationProfileFormValues
  errors: FieldErrors
  onChange: (patch: Partial<OrganizationProfileFormValues>) => void
  t: ReturnType<typeof useTranslations<'onboarding.organizationProfile'>>
  tOrg: ReturnType<typeof useTranslations<'onboarding.organization'>>
}

function StepOrganizationDetails({
  values,
  errors,
  logoPreviewUrl,
  logoUploading,
  fileInputRef,
  onChange,
  onPickLogo,
  onLogoSelected,
  t,
  tOrg,
}: StepProps & {
  logoPreviewUrl: string | null
  logoUploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onPickLogo: () => void
  onLogoSelected: (file: File | null) => void
}) {
  return (
    <FieldGroup className="gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.name ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium leading-5 text-ink">
            {t('fields.name')}
            <RequiredAsterisk />
          </FieldLabel>
          <div className="relative">
            <Building2
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              value={values.name}
              autoComplete="organization"
              className={cn(
                authInputWithIconClassName,
                errors.name && 'border-negative'
              )}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          {errors.name ? (
            <FieldError className="text-xs leading-4 text-negative">{errors.name}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.email ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium leading-5 text-ink">
            {t('fields.email')}
            <RequiredAsterisk />
          </FieldLabel>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="email"
              value={values.email}
              readOnly
              className={cn(
                authInputWithIconClassName,
                'cursor-default bg-primary-pale/50 text-body',
                errors.email && 'border-negative'
              )}
            />
          </div>
          {errors.email ? (
            <FieldError className="text-xs leading-4 text-negative">{errors.email}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.phone ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium leading-5 text-ink">
            {t('fields.phone')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="tel"
              value={values.phone}
              placeholder={tOrg('phonePlaceholder')}
              className={cn(
                authInputWithIconClassName,
                errors.phone && 'border-negative'
              )}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
          </div>
          <FieldDescription className="text-xs leading-4 text-mute">
            {t('fields.phoneHint')}
          </FieldDescription>
          {errors.phone ? (
            <FieldError className="text-xs leading-4 text-negative">{errors.phone}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.alternatePhone ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium leading-5 text-ink">
            {t('fields.alternatePhone')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="tel"
              value={values.alternatePhone}
              className={cn(
                authInputWithIconClassName,
                errors.alternatePhone && 'border-negative'
              )}
              onChange={(e) => onChange({ alternatePhone: e.target.value })}
            />
          </div>
          {errors.alternatePhone ? (
            <FieldError className="text-xs leading-4 text-negative">
              {errors.alternatePhone}
            </FieldError>
          ) : null}
        </Field>
      </div>

      <Field data-invalid={errors.website ? true : undefined} className="gap-2">
        <FieldLabel className="text-sm font-medium leading-5 text-ink">
          {t('fields.website')} <span className="font-normal text-mute">({t('optional')})</span>
        </FieldLabel>
        <div className="relative">
          <Globe
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <Input
            type="url"
            value={values.website}
            placeholder={tOrg('websitePlaceholder')}
            className={cn(
              authInputWithIconClassName,
              errors.website && 'border-negative'
            )}
            onChange={(e) => onChange({ website: e.target.value })}
          />
        </div>
        {errors.website ? (
          <FieldError className="text-xs leading-4 text-negative">{errors.website}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={errors.industry ? true : undefined} className="gap-2">
        <FieldLabel className="text-sm font-medium leading-5 text-ink">
          {t('fields.industry')}
          <RequiredAsterisk />
        </FieldLabel>
        <select
          className={selectClassName(Boolean(errors.industry))}
          value={values.industry}
          onChange={(e) => onChange({ industry: e.target.value })}
        >
          <option value="">{t('fields.industryPlaceholder')}</option>
          {INDUSTRY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {tOrg(`step2.industries.${option}`)}
            </option>
          ))}
        </select>
        {errors.industry ? (
          <FieldError className="text-xs leading-4 text-negative">{errors.industry}</FieldError>
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onPickLogo}
          disabled={logoUploading}
          className={cn(
            'flex min-h-[10.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center transition-colors',
            'hover:border-primary/40 hover:bg-primary-pale/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {logoUploading ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          ) : (
            <Upload className="size-6 text-primary" aria-hidden />
          )}
          <span className="text-sm font-semibold text-ink">{t('fields.logoUpload')}</span>
          <span className="text-xs leading-4 text-mute">{t('fields.logoHint')}</span>
        </button>
        <div className="flex min-h-[10.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-canvas px-4 py-6">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-mute uppercase">
            {t('fields.logoPreview')}
          </span>
          {logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreviewUrl}
              alt=""
              className="size-16 rounded-full object-cover ring-4 ring-primary/15"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-primary-pale text-positive-deep ring-4 ring-primary/10">
              <Building2 className="size-7" aria-hidden />
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
        />
      </div>
      {errors.logo ? <p className="text-sm text-negative">{errors.logo}</p> : null}
    </FieldGroup>
  )
}

function StepBusinessInformation({ values, errors, onChange, t, tOrg }: StepProps) {
  return (
    <FieldGroup className="gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.businessSize ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.businessSize')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            className={selectClassName(Boolean(errors.businessSize))}
            value={values.businessSize}
            onChange={(e) => onChange({ businessSize: e.target.value })}
          >
            <option value="">{t('fields.businessSizePlaceholder')}</option>
            {COMPANY_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {tOrg(`step2.companySizes.${option}`)}
              </option>
            ))}
          </select>
          {errors.businessSize ? <FieldError>{errors.businessSize}</FieldError> : null}
        </Field>

        <Field className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.businessType')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <select
            className={selectClassName()}
            value={values.organizationType}
            onChange={(e) => onChange({ organizationType: e.target.value })}
          >
            <option value="">{t('fields.businessTypePlaceholder')}</option>
            {ORGANIZATION_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {tOrg(`step2.organizationTypes.${option}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field data-invalid={errors.description ? true : undefined} className="gap-2">
        <FieldLabel className="text-sm font-medium text-ink">
          {t('fields.description')} <span className="font-normal text-mute">({t('optional')})</span>
        </FieldLabel>
        <div className="relative">
          <Textarea
            value={values.description}
            maxLength={DESCRIPTION_MAX}
            rows={5}
            className={cn(authInputClassName, 'min-h-[8rem] resize-y pb-8', errors.description && 'border-negative')}
            onChange={(e) => onChange({ description: e.target.value })}
          />
          <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-mute">
            {values.description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        {errors.description ? <FieldError>{errors.description}</FieldError> : null}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.defaultLanguage')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <select
            className={selectClassName()}
            value={values.defaultLanguage}
            onChange={(e) => onChange({ defaultLanguage: e.target.value })}
          >
            <option value="">{t('fields.defaultLanguagePlaceholder')}</option>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`languages.${option}`)}
              </option>
            ))}
          </select>
        </Field>

        <Field className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.registrationNumber')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <Input
            value={values.businessRegistrationNumber}
            className={authInputClassName}
            onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
          />
        </Field>
      </div>
    </FieldGroup>
  )
}

function StepAddress({
  values,
  errors,
  onChange,
  t,
}: Omit<StepProps, 'tOrg'>) {
  return (
    <FieldGroup className="gap-5">
      <Field data-invalid={errors.addressLine1 ? true : undefined} className="gap-2">
        <FieldLabel className="text-sm font-medium text-ink">
          {t('fields.addressLine1')}
          <RequiredAsterisk />
        </FieldLabel>
        <Input
          value={values.addressLine1}
          placeholder={t('fields.addressLine1Placeholder')}
          className={cn(authInputClassName, errors.addressLine1 && 'border-negative')}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
        />
        {errors.addressLine1 ? <FieldError>{errors.addressLine1}</FieldError> : null}
      </Field>

      <Field className="gap-2">
        <FieldLabel className="text-sm font-medium text-ink">
          {t('fields.addressLine2')} <span className="font-normal text-mute">({t('optional')})</span>
        </FieldLabel>
        <Input
          value={values.addressLine2}
          placeholder={t('fields.addressLine2Placeholder')}
          className={authInputClassName}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.city ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.city')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            value={values.city}
            className={cn(authInputClassName, errors.city && 'border-negative')}
            onChange={(e) => onChange({ city: e.target.value })}
          />
          {errors.city ? <FieldError>{errors.city}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.state ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.state')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            value={values.state}
            className={cn(authInputClassName, errors.state && 'border-negative')}
            onChange={(e) => onChange({ state: e.target.value })}
          />
          {errors.state ? <FieldError>{errors.state}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.postalCode ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.postalCode')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            value={values.postalCode}
            className={cn(authInputClassName, errors.postalCode && 'border-negative')}
            onChange={(e) => onChange({ postalCode: e.target.value })}
          />
          {errors.postalCode ? <FieldError>{errors.postalCode}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.country ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.country')}
            <RequiredAsterisk />
          </FieldLabel>
          <select
            className={selectClassName(Boolean(errors.country))}
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
          >
            <option value="">{t('fields.countryPlaceholder')}</option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code}
              </option>
            ))}
          </select>
          {errors.country ? <FieldError>{errors.country}</FieldError> : null}
        </Field>
      </div>
    </FieldGroup>
  )
}

function StepReview({
  values,
  logoPreviewUrl,
  confirmed,
  confirmId,
  confirmError,
  onConfirmChange,
  onEdit,
  t,
  tOrg,
}: {
  values: OrganizationProfileFormValues
  logoPreviewUrl: string | null
  confirmed: boolean
  confirmId: string
  confirmError?: string
  onConfirmChange: (value: boolean) => void
  onEdit: (step: ProfileStep) => void
  t: ReturnType<typeof useTranslations<'onboarding.organizationProfile'>>
  tOrg: ReturnType<typeof useTranslations<'onboarding.organization'>>
}) {
  const industryLabel = INDUSTRY_OPTIONS.includes(values.industry as IndustryOption)
    ? tOrg(`step2.industries.${values.industry as IndustryOption}`)
    : values.industry || t('review.empty')
  const sizeLabel = COMPANY_SIZE_OPTIONS.includes(values.businessSize as CompanySizeOption)
    ? tOrg(`step2.companySizes.${values.businessSize as CompanySizeOption}`)
    : values.businessSize || t('review.empty')
  const typeLabel = ORGANIZATION_TYPE_OPTIONS.includes(
    values.organizationType as OrganizationTypeOption
  )
    ? tOrg(`step2.organizationTypes.${values.organizationType as OrganizationTypeOption}`)
    : values.organizationType || t('review.empty')

  return (
    <div className="flex flex-col gap-4">
      <ReviewCard title={t('review.organization')} onEdit={() => onEdit(1)} editLabel={t('actions.edit')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-pale text-positive-deep">
            {logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreviewUrl} alt="" className="size-full object-cover" />
            ) : (
              <Building2 className="size-6" aria-hidden />
            )}
          </span>
          <dl className="grid min-w-0 flex-1 gap-2 text-sm sm:grid-cols-2">
            <ReviewItem label={t('fields.name')} value={values.name} />
            <ReviewItem label={t('fields.email')} value={values.email} />
            <ReviewItem label={t('fields.phone')} value={values.phone || t('review.empty')} />
            <ReviewItem
              label={t('fields.alternatePhone')}
              value={values.alternatePhone || t('review.empty')}
            />
            <ReviewItem label={t('fields.website')} value={values.website || t('review.empty')} />
            <ReviewItem label={t('fields.industry')} value={industryLabel} />
          </dl>
        </div>
      </ReviewCard>

      <ReviewCard title={t('review.business')} onEdit={() => onEdit(2)} editLabel={t('actions.edit')}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <ReviewItem label={t('fields.businessSize')} value={sizeLabel} />
          <ReviewItem label={t('fields.businessType')} value={typeLabel} />
          <ReviewItem
            label={t('fields.description')}
            value={values.description || t('review.empty')}
            className="sm:col-span-2"
          />
          <ReviewItem
            label={t('fields.defaultLanguage')}
            value={
              values.defaultLanguage
                ? t(`languages.${values.defaultLanguage as 'en'}`)
                : t('review.empty')
            }
          />
          <ReviewItem
            label={t('fields.registrationNumber')}
            value={values.businessRegistrationNumber || t('review.empty')}
          />
        </dl>
      </ReviewCard>

      <ReviewCard title={t('review.address')} onEdit={() => onEdit(3)} editLabel={t('actions.edit')}>
        <div className="flex items-start gap-3 text-sm text-body">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            {formatOrganizationAddressLines(
              {
                addressLine1: values.addressLine1,
                addressLine2: values.addressLine2,
                city: values.city,
                state: values.state,
                postalCode: values.postalCode,
              },
              values.country
            ) || t('review.empty')}
          </p>
        </div>
      </ReviewCard>

      <label
        htmlFor={confirmId}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-ink"
      >
        <input
          id={confirmId}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
          className="mt-0.5 size-4 cursor-pointer rounded border-[#CBD5E1] text-primary focus-visible:ring-primary/30"
        />
        <span>{t('review.confirmLabel')}</span>
      </label>
      {confirmError ? <p className="text-sm text-negative">{confirmError}</p> : null}
    </div>
  )
}

function ReviewCard({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  editLabel: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-canvas p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Pencil className="size-3.5" aria-hidden />
          {editLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

function ReviewItem({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-ink">{value}</dd>
    </div>
  )
}
