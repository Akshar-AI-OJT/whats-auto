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
  Loader2,
  Mail,
  Phone,
  Upload,
} from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
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
import { OnboardingSelect } from '@/components/onboarding/OnboardingSelect'
import {
  OrganizationProfileFormCard,
  OrganizationProfileHeader,
  OrganizationProfileLayout,
} from '@/components/onboarding/OrganizationProfileLayout'
import { OrganizationProfileSidebar } from '@/components/onboarding/OrganizationProfileSidebar'
import { OrganizationProfileStepHeader } from '@/components/onboarding/OrganizationProfileStepHeader'
import { OrganizationProfileFormFooter } from '@/components/onboarding/OrganizationProfileFormFooter'
import {
  OrganizationProfileReviewCard,
  OrganizationProfileReviewGrid,
  OrganizationProfileReviewItem,
} from '@/components/onboarding/OrganizationProfileReviewCard'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import {
  onboardingInputClassName,
  onboardingInputWithIconClassName,
  onboardingTextareaClassName,
} from '@/components/onboarding/onboarding-field-styles'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  clearPendingOrganizationPreferences,
  isValidEmail,
  isValidPhone,
  isValidWebsiteUrl,
  readPendingOrganizationPreferences,
} from '@/lib/onboarding'
import {
  buildOrganizationProfileUpdateBody,
  calculateOrganizationProfileCompletion,
  organizationToProfileFormValues,
  type OrganizationProfileFormValues,
} from '@/lib/organization-profile'
import {
  getSubdivisionsForCountry,
  isSubdivisionValidForCountry,
  resolveSubdivisionForCountry,
} from '@/lib/country-subdivisions'
import { cn } from '@/lib/utils'

const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
const DESCRIPTION_MAX = 500

type ProfileStep = 1 | 2 | 3 | 4

type FieldErrors = Partial<Record<keyof OrganizationProfileFormValues | 'logo' | 'confirm', string>>

function selectClassName(invalid?: boolean) {
  return cn(invalid && 'border-negative')
}

function buildInitialProfileValues(
  org: Parameters<typeof organizationToProfileFormValues>[0]
): OrganizationProfileFormValues {
  const prefs = readPendingOrganizationPreferences()
  const base = organizationToProfileFormValues(org)
  const companySize = prefs?.companySize?.trim()
  const defaultLanguage = prefs?.defaultLanguage?.trim()
  const country = base.country
  return {
    ...base,
    state: resolveSubdivisionForCountry(country, base.state),
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
      clearPendingOrganizationPreferences()
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
        <OrganizationProfileHeader />
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
    <OrganizationProfileLayout
      sidebar={
        <OrganizationProfileSidebar
          currentStep={step}
          completionPercent={completion?.percent ?? null}
        />
      }
    >
      <OrganizationProfileFormCard>
        <OrganizationProfileStepHeader
          title={steps[step - 1]?.title ?? ''}
          description={steps[step - 1]?.description ?? ''}
          stepBadge={t('stepBadge', { step, total: 4 })}
        />

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

        <OrganizationProfileFormFooter>
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
        </OrganizationProfileFormFooter>
      </OrganizationProfileFormCard>
    </OrganizationProfileLayout>
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
                onboardingInputWithIconClassName,
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
                onboardingInputWithIconClassName,
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
                onboardingInputWithIconClassName,
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
                onboardingInputWithIconClassName,
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

      <div className="grid gap-5 sm:grid-cols-2">
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
                onboardingInputWithIconClassName,
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
          <OnboardingSelect
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
          </OnboardingSelect>
          {errors.industry ? (
            <FieldError className="text-xs leading-4 text-negative">{errors.industry}</FieldError>
          ) : null}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E2E8F0] bg-canvas p-4">
          <p className="mb-3 text-sm font-semibold text-ink">{t('fields.logoUpload')}</p>
          <button
            type="button"
            onClick={onPickLogo}
            disabled={logoUploading}
            aria-label={t('fields.logoUpload')}
            className={cn(
              'flex min-h-[9.5rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-5 text-center transition-colors',
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
            <span className="text-xs leading-4 text-mute">{t('fields.logoHint')}</span>
          </button>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-canvas p-4">
          <p className="mb-3 text-sm font-semibold text-ink">{t('fields.logoPreview')}</p>
          <div className="flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-5">
            {logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreviewUrl}
                alt=""
                className="size-16 rounded-full object-cover ring-4 ring-primary/15"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-full bg-primary-pale text-primary ring-4 ring-primary/10">
                <Building2 className="size-7" aria-hidden />
              </span>
            )}
          </div>
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
          <OnboardingSelect
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
          </OnboardingSelect>
          {errors.businessSize ? <FieldError>{errors.businessSize}</FieldError> : null}
        </Field>

        <Field className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.businessType')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <OnboardingSelect
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
          </OnboardingSelect>
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
            className={cn(onboardingTextareaClassName, 'min-h-[9rem] pb-8', errors.description && 'border-negative')}
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
          <OnboardingSelect
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
          </OnboardingSelect>
        </Field>

        <Field className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.registrationNumber')}{' '}
            <span className="font-normal text-mute">({t('optional')})</span>
          </FieldLabel>
          <Input
            value={values.businessRegistrationNumber}
            className={onboardingInputClassName}
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
  const stateOptions = getSubdivisionsForCountry(values.country)
  const stateSelectDisabled = !values.country.trim() || stateOptions.length === 0

  function handleCountryChange(country: string) {
    const patch: Partial<OrganizationProfileFormValues> = { country }
    if (!isSubdivisionValidForCountry(country, values.state)) {
      patch.state = ''
    }
    onChange(patch)
  }

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
          className={cn(onboardingInputClassName, errors.addressLine1 && 'border-negative')}
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
          className={onboardingInputClassName}
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
            className={cn(onboardingInputClassName, errors.city && 'border-negative')}
            onChange={(e) => onChange({ city: e.target.value })}
          />
          {errors.city ? <FieldError>{errors.city}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.country ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.country')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            className={selectClassName(Boolean(errors.country))}
            value={values.country}
            onChange={(e) => handleCountryChange(e.target.value)}
          >
            <option value="">{t('fields.countryPlaceholder')}</option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code}
              </option>
            ))}
          </OnboardingSelect>
          {errors.country ? <FieldError>{errors.country}</FieldError> : null}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.state ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink" id="org-profile-state-label">
            {t('fields.state')}
            <RequiredAsterisk />
          </FieldLabel>
          <OnboardingSelect
            id="org-profile-state"
            aria-labelledby="org-profile-state-label"
            aria-invalid={errors.state ? true : undefined}
            className={selectClassName(Boolean(errors.state))}
            value={values.state}
            disabled={stateSelectDisabled}
            onChange={(e) => onChange({ state: e.target.value })}
          >
            <option value="">{t('fields.statePlaceholder')}</option>
            {stateOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </OnboardingSelect>
          {errors.state ? <FieldError>{errors.state}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.postalCode ? true : undefined} className="gap-2">
          <FieldLabel className="text-sm font-medium text-ink">
            {t('fields.postalCode')}
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            value={values.postalCode}
            className={cn(onboardingInputClassName, errors.postalCode && 'border-negative')}
            onChange={(e) => onChange({ postalCode: e.target.value })}
          />
          {errors.postalCode ? <FieldError>{errors.postalCode}</FieldError> : null}
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
      <OrganizationProfileReviewCard
        title={t('review.organization')}
        onEdit={() => onEdit(1)}
        editLabel={t('actions.edit')}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-pale text-primary">
            {logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreviewUrl} alt="" className="size-full object-cover" />
            ) : (
              <Building2 className="size-6" aria-hidden />
            )}
          </span>
          <OrganizationProfileReviewGrid className="flex-1">
            <OrganizationProfileReviewItem label={t('fields.name')} value={values.name} />
            <OrganizationProfileReviewItem label={t('fields.email')} value={values.email} />
            <OrganizationProfileReviewItem
              label={t('fields.phone')}
              value={values.phone || t('review.empty')}
            />
            <OrganizationProfileReviewItem
              label={t('fields.alternatePhone')}
              value={values.alternatePhone || t('review.empty')}
            />
            <OrganizationProfileReviewItem
              label={t('fields.website')}
              value={values.website || t('review.empty')}
            />
            <OrganizationProfileReviewItem label={t('fields.industry')} value={industryLabel} />
          </OrganizationProfileReviewGrid>
        </div>
      </OrganizationProfileReviewCard>

      <OrganizationProfileReviewCard
        title={t('review.business')}
        onEdit={() => onEdit(2)}
        editLabel={t('actions.edit')}
      >
        <OrganizationProfileReviewGrid>
          <OrganizationProfileReviewItem label={t('fields.businessSize')} value={sizeLabel} />
          <OrganizationProfileReviewItem label={t('fields.businessType')} value={typeLabel} />
          <OrganizationProfileReviewItem
            label={t('fields.description')}
            value={values.description || t('review.empty')}
            className="sm:col-span-2"
          />
          <OrganizationProfileReviewItem
            label={t('fields.defaultLanguage')}
            value={
              values.defaultLanguage
                ? t(`languages.${values.defaultLanguage as 'en'}`)
                : t('review.empty')
            }
          />
          <OrganizationProfileReviewItem
            label={t('fields.registrationNumber')}
            value={values.businessRegistrationNumber || t('review.empty')}
          />
        </OrganizationProfileReviewGrid>
      </OrganizationProfileReviewCard>

      <OrganizationProfileReviewCard
        title={t('review.address')}
        onEdit={() => onEdit(3)}
        editLabel={t('actions.edit')}
      >
        <OrganizationProfileReviewGrid>
          <OrganizationProfileReviewItem
            label={t('fields.addressLine1')}
            value={values.addressLine1 || t('review.empty')}
            className="sm:col-span-2"
          />
          <OrganizationProfileReviewItem
            label={t('fields.addressLine2')}
            value={values.addressLine2 || t('review.empty')}
            className="sm:col-span-2"
          />
          <OrganizationProfileReviewItem
            label={t('fields.city')}
            value={values.city || t('review.empty')}
          />
          <OrganizationProfileReviewItem
            label={t('fields.country')}
            value={values.country || t('review.empty')}
          />
          <OrganizationProfileReviewItem
            label={t('fields.state')}
            value={values.state || t('review.empty')}
          />
          <OrganizationProfileReviewItem
            label={t('fields.postalCode')}
            value={values.postalCode || t('review.empty')}
          />
        </OrganizationProfileReviewGrid>
      </OrganizationProfileReviewCard>

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
