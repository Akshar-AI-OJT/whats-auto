'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { getValidAccessToken } from '@/lib/access-token'
import { queryKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import {
  buildCreateOrganizationPayload,
  clearLegacyOrganizationCache,
  clearPendingOnboardingContact,
  isValidEmail,
  isValidOrganizationSlug,
  isValidPhone,
  isValidWebsiteUrl,
  markOnboardingChecklistVisible,
  readPendingOnboardingContact,
  savePendingWorkspacePlan,
  savePendingWorkspacePreferences,
  ORG_SETUP_PATH,
} from '@/lib/onboarding'
import {
  acceptInvitationPath,
  isAcceptInvitationPath,
  normalizeAppPath,
  readPendingInvitationId,
  resolvePostAuthPath,
  SUPER_ADMIN_HOME_PATH,
} from '@/lib/post-auth-redirect'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'
import { useRouter } from '@/i18n/navigation'
import { BillingCheckoutDialog } from '@/components/dashboard/billing/BillingCheckoutDialog'
import { startBillingPayment } from '@/components/dashboard/billing/billing-utils'
import { OrganizationBasicsStep } from './OrganizationBasicsStep'
import { CompanyInformationStep } from './CompanyInformationStep'
import {
  SubscriptionPlanSelectionStep,
  type OnboardingCheckoutablePlanSelection,
} from './SubscriptionPlanSelectionStep'
import { OrganizationPreferencesStep } from './OrganizationPreferencesStep'
import { OrganizationStepper } from './OrganizationStepper'
import type {
  OrganizationWizardBasicsErrors,
  OrganizationWizardCompanyErrors,
  OrganizationWizardPreferencesErrors,
  OrganizationWizardState,
  OrganizationTypeOption,
  OrgWizardStep,
} from './organization-wizard-types'

function createInitialState(): OrganizationWizardState {
  const contact = readPendingOnboardingContact()
  return {
    name: '',
    slug: '',
    // Leave empty — org email may differ from the signed-in user's email.
    email: '',
    phone: contact.phone,
    website: '',
    slugTouched: false,
    logoFileName: '',
    logoPreviewUrl: null,
    organizationType: '',
    address: '',
    industry: '',
    companySize: '',
    country: '',
    timezone: '',
    currency: '',
    defaultLanguage: 'en',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    themePreference: 'system',
    notifications: ['emailUpdates', 'campaignAlerts'],
  }
}

/**
 * Organization onboarding wizard (4 steps).
 * Step 3 creates the organization via POST /api/v1/organizations.
 * Non-API fields (logo, company size, preferences) are kept in session for later settings.
 */
export function OrganizationRegistrationForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const queryClient = useQueryClient()
  const formErrorId = useId()

  const [step, setStep] = useState<OrgWizardStep>(1)
  const [state, setState] = useState<OrganizationWizardState>(createInitialState)
  const [selectedPlan, setSelectedPlan] = useState<OnboardingCheckoutablePlanSelection | null>(null)
  const [basicsErrors, setBasicsErrors] = useState<OrganizationWizardBasicsErrors>({})
  const [guardingInvite, setGuardingInvite] = useState(true)

  // Only bounce invitees / platform superadmins. Users who already have a
  // organization (Create organization from the switcher) must stay on this page.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const nextPath = await resolvePostAuthPath({
          preferredCallback: null,
          fallback: ORG_SETUP_PATH,
        })
        if (cancelled) return
        const normalized = normalizeAppPath(nextPath)
        if (
          isAcceptInvitationPath(normalized) ||
          normalized === SUPER_ADMIN_HOME_PATH ||
          normalized.startsWith('/admin')
        ) {
          router.replace(nextPath)
          return
        }
      } catch {
        const stored = readPendingInvitationId()
        if (!cancelled && stored) {
          router.replace(acceptInvitationPath(stored))
          return
        }
      } finally {
        if (!cancelled) setGuardingInvite(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const [companyErrors, setCompanyErrors] = useState<OrganizationWizardCompanyErrors>({})
  const [preferencesErrors, setPreferencesErrors] =
    useState<OrganizationWizardPreferencesErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const checkoutLockRef = useRef(false)

  useEffect(() => {
    return () => {
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl)
    }
    // Only revoke on unmount for the latest preview URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patchState(patch: Partial<OrganizationWizardState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function validateBasics(): OrganizationWizardBasicsErrors {
    const next: OrganizationWizardBasicsErrors = {}
    const trimmedName = state.name.trim()

    if (!trimmedName || trimmedName.length < 2) {
      next.name = t('errors.nameRequired')
    } else if (trimmedName.length > 200) {
      next.name = t('errors.nameTooLong')
    }

    const normalizedSlug = state.slug.trim()
    if (!normalizedSlug) {
      next.slug = t('errors.slugRequired')
    } else if (!isValidOrganizationSlug(normalizedSlug)) {
      next.slug = t('errors.slugInvalid')
    }

    if (!state.email.trim()) {
      next.email = t('errors.emailRequired')
    } else if (!isValidEmail(state.email.trim())) {
      next.email = t('errors.emailInvalid')
    }

    if (!state.phone.trim()) {
      next.phone = t('errors.phoneRequired')
    } else if (!isValidPhone(state.phone)) {
      next.phone = t('errors.phoneInvalid')
    }

    if (state.website.trim() && !isValidWebsiteUrl(state.website)) {
      next.website = t('errors.websiteInvalid')
    }

    return next
  }

  function validateCompany(): OrganizationWizardCompanyErrors {
    const next: OrganizationWizardCompanyErrors = {}
    if (!state.organizationType) {
      next.organizationType = t('errors.organizationTypeRequired')
    }
    const trimmedAddress = state.address.trim()
    if (!trimmedAddress) {
      next.address = t('errors.addressRequired')
    } else if (trimmedAddress.length < 8) {
      next.address = t('errors.addressTooShort')
    }
    if (!state.industry) next.industry = t('errors.industryRequired')
    if (!state.companySize) next.companySize = t('errors.companySizeRequired')
    if (!state.country.trim() || state.country.trim().length < 2) {
      next.country = t('errors.countryRequired')
    }
    if (!state.timezone.trim()) next.timezone = t('errors.timezoneRequired')
    return next
  }

  function validatePreferences(): OrganizationWizardPreferencesErrors {
    const next: OrganizationWizardPreferencesErrors = {}
    if (!state.defaultLanguage) next.defaultLanguage = t('errors.languageRequired')
    if (!state.dateFormat) next.dateFormat = t('errors.dateFormatRequired')
    if (!state.timeFormat) next.timeFormat = t('errors.timeFormatRequired')
    if (!state.themePreference) next.themePreference = t('errors.themeRequired')
    return next
  }

  async function handleCreateWorkspace() {
    setError(null)
    const nextErrors = validatePreferences()
    setPreferencesErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const basics = validateBasics()
    if (Object.keys(basics).length > 0) {
      setBasicsErrors(basics)
      setStep(1)
      return
    }

    const company = validateCompany()
    if (Object.keys(company).length > 0) {
      setCompanyErrors(company)
      setStep(2)
      return
    }

    setPending(true)

    try {
      // Only API-contract fields — logo / companySize / preferences stay in session.
      const payload = buildCreateOrganizationPayload({
        name: state.name,
        slug: state.slug,
        email: state.email,
        phone: state.phone,
        website: state.website,
        industry: state.industry || undefined,
        organizationType: state.organizationType as OrganizationTypeOption,
        address: state.address,
        country: state.country,
        timezone: state.timezone,
        currency: state.currency || undefined,
      })

      await api.organizations.create(payload)

      // Backend sets the new org active and remints JWT; align shared session before dashboard.
      await authClient.getSession({ query: { disableCookieCache: true } })
      await getValidAccessToken()
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })

      clearLegacyOrganizationCache()

      savePendingWorkspacePreferences({
        companySize: state.companySize,
        logoFileName: state.logoFileName,
        defaultLanguage: state.defaultLanguage,
        dateFormat: state.dateFormat,
        timeFormat: state.timeFormat,
        themePreference: state.themePreference,
        notifications: state.notifications,
      })

      clearPendingOnboardingContact()
      markOnboardingChecklistVisible()
      // Go to final plan selection before entering the dashboard.
      setStep(4)
      router.refresh()
    } catch (err) {
      const apiError = err as ApiError

      if (apiError.status === 401) {
        setError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }

      const message = apiError.message || t('errors.generic')
      if (apiError.code === 'E_ORG_SLUG_ALREADY_EXISTS' || /slug/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, slug: message }))
        setStep(1)
      } else if (/email/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, email: message }))
        setStep(1)
      } else if (/phone/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, phone: message }))
        setStep(1)
      } else if (/website/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, website: message }))
        setStep(1)
      } else if (/organizationType|organization type/i.test(message)) {
        setCompanyErrors((prev) => ({ ...prev, organizationType: message }))
        setStep(2)
      } else if (/address/i.test(message)) {
        setCompanyErrors((prev) => ({ ...prev, address: message }))
        setStep(2)
      } else if (/country/i.test(message)) {
        setCompanyErrors((prev) => ({ ...prev, country: message }))
        setStep(2)
      } else if (/timezone/i.test(message)) {
        setCompanyErrors((prev) => ({ ...prev, timezone: message }))
        setStep(2)
      }
      setError(message)
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (step === 1) {
      const nextErrors = validateBasics()
      setBasicsErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return
      setStep(2)
      return
    }

    if (step === 2) {
      const nextErrors = validateCompany()
      setCompanyErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return
      setStep(3)
      return
    }

    if (step === 3) {
      await handleCreateWorkspace()
      return
    }

    if (step === 4) {
      if (checkoutPending) return
      if (!selectedPlan) {
        setError(t('errors.planRequired'))
        return
      }

      if (!selectedPlan.checkoutable) {
        setError(t('errors.planNotCheckoutable'))
        return
      }

      setCheckoutError(null)
      setConfirmOpen(true)
      return
    }
  }

  async function handleCheckoutConfirm() {
    if (checkoutPending || checkoutLockRef.current) return
    if (!selectedPlan) return

    if (!selectedPlan.checkoutable) {
      setCheckoutError(t('errors.planNotCheckoutable'))
      return
    }

    checkoutLockRef.current = true
    setCheckoutPending(true)
    setCheckoutError(null)

    try {
      // Persist the real backend plan UUID so other screens can resume/refresh state.
      savePendingWorkspacePlan(selectedPlan.id)
      await startBillingPayment(selectedPlan.id)
      setConfirmOpen(false)
      router.replace('/onboarding/organization-profile')
    } catch (err) {
      checkoutLockRef.current = false
      const apiError = err as ApiError

      if (apiError.status === 401) {
        setCheckoutError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }

      setCheckoutError(apiError.message || t('errors.checkoutFailed'))
    } finally {
      setCheckoutPending(false)
    }
  }

  const stepperSteps = [
    { id: 1 as const, label: t('steps.basics') },
    { id: 2 as const, label: t('steps.company') },
    { id: 3 as const, label: t('steps.preferences') },
    { id: 4 as const, label: t('steps.plan') },
  ]

  if (guardingInvite) {
    return (
      <AuthLayout branding={<AuthBranding variant="organization" />}>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      branding={<AuthBranding variant="organization" />}
      wideForm={step === 4}
      contentClassName={step === 4 ? 'max-w-none' : undefined}
    >
      <form
        className={cn('flex w-full min-w-0 flex-col', className)}
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending || checkoutPending}
        aria-describedby={error ? formErrorId : undefined}
        {...props}
      >
        <FieldGroup className="gap-7">
          <div className="flex flex-col gap-4 text-left">
            <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow', { step, total: 4 })}
            </p>
            <OrganizationStepper currentStep={step} steps={stepperSteps} />
          </div>

          {step === 1 ? (
            <OrganizationBasicsStep
              state={state}
              errors={basicsErrors}
              pending={pending}
              onChange={patchState}
              onClearError={(key) =>
                setBasicsErrors((prev) => ({ ...prev, [key]: undefined }))
              }
            />
          ) : null}

          {step === 2 ? (
            <CompanyInformationStep
              state={state}
              errors={companyErrors}
              pending={pending}
              onChange={patchState}
              onClearError={(key) =>
                setCompanyErrors((prev) => ({ ...prev, [key]: undefined }))
              }
            />
          ) : null}

          {step === 3 ? (
            <OrganizationPreferencesStep
              state={state}
              errors={preferencesErrors}
              pending={pending}
              onChange={patchState}
              onClearError={(key) =>
                setPreferencesErrors((prev) => ({ ...prev, [key]: undefined }))
              }
            />
          ) : null}

          {step === 4 ? (
            <SubscriptionPlanSelectionStep
              selectedPlanId={selectedPlan?.id ?? null}
              pending={pending || checkoutPending}
              onSelect={(plan) => {
                setSelectedPlan(plan)
                setError(null)
              }}
            />
          ) : null}

          {error ? (
            <div
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
            >
              {error}
            </div>
          ) : null}

          <Field className="gap-0">
            {step === 4 ? (
              <div className="flex flex-col gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || checkoutPending}
                  className={cn(authOutlineButtonClassName, 'sm:w-auto sm:min-w-[7.5rem]')}
                  onClick={() => {
                    setError(null)
                    setStep((prev) => (prev > 1 ? ((prev - 1) as OrgWizardStep) : prev))
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('back')}
                </Button>

                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
                  <Button
                    type="submit"
                    disabled={pending || checkoutPending}
                    aria-busy={pending || checkoutPending}
                    className={cn(authPrimaryButtonClassName, 'sm:min-w-[14.5rem]')}
                  >
                    {checkoutPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        <span>{t('proceedToCheckout')}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="size-4" aria-hidden />
                        <span>{t('proceedToCheckout')}</span>
                        <ArrowRight className="size-4" aria-hidden />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-mute sm:text-right">
                    {t('checkoutHint')}
                  </p>
                </div>
              </div>
            ) : (
              <div className={cn('flex flex-col gap-2.5', step > 1 && 'sm:flex-row-reverse')}>
                <Button
                  type="submit"
                  disabled={pending || checkoutPending}
                  aria-busy={pending || checkoutPending}
                  className={cn(authPrimaryButtonClassName, step > 1 && 'sm:flex-1')}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      <span>{t('creating')}</span>
                    </>
                  ) : step === 3 ? (
                    t('createWorkspace')
                  ) : (
                    t('continue')
                  )}
                </Button>

                {step > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || checkoutPending}
                    className={cn(authOutlineButtonClassName, 'sm:flex-1')}
                    onClick={() => {
                      setError(null)
                      setStep((prev) => (prev > 1 ? ((prev - 1) as OrgWizardStep) : prev))
                    }}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    {t('back')}
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
        </FieldGroup>
      </form>

      <BillingCheckoutDialog
        open={confirmOpen}
        pending={checkoutPending}
        error={checkoutError}
        planName={selectedPlan ? selectedPlan.name : ''}
        onOpenChange={(next) => {
          if (!checkoutPending) {
            setConfirmOpen(next)
            if (!next) setCheckoutError(null)
          }
        }}
        onConfirm={() => {
          void handleCheckoutConfirm()
        }}
      />
    </AuthLayout>
  )
}
