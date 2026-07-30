'use client'

import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import {
  buildCreateOrganizationPayload,
  clearLegacyOrganizationCache,
  clearPendingOnboardingContact,
  getDefaultOrgLocaleDefaults,
  isValidEmail,
  isValidOrganizationSlug,
  isValidPhone,
  markOnboardingChecklistVisible,
  readPendingOnboardingContact,
  savePendingWorkspacePreferences,
} from '@/lib/onboarding'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'
import { useRouter } from '@/i18n/navigation'
import { OrganizationBasicsStep } from './OrganizationBasicsStep'
import { CompanyInformationStep } from './CompanyInformationStep'
import { WorkspacePreferencesStep } from './WorkspacePreferencesStep'
import { OrganizationStepper } from './OrganizationStepper'
import type {
  OrganizationWizardBasicsErrors,
  OrganizationWizardCompanyErrors,
  OrganizationWizardPreferencesErrors,
  OrganizationWizardState,
  OrgWizardStep,
} from './organization-wizard-types'

function createInitialState(): OrganizationWizardState {
  const contact = readPendingOnboardingContact()
  const defaults = getDefaultOrgLocaleDefaults()
  return {
    name: '',
    slug: '',
    email: contact.email,
    phone: contact.phone,
    slugTouched: false,
    logoFileName: '',
    logoPreviewUrl: null,
    industry: '',
    companySize: '',
    country: defaults.country,
    timezone: defaults.timezone,
    defaultLanguage: 'en',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    themePreference: 'system',
    notifications: ['emailUpdates', 'campaignAlerts'],
  }
}

/**
 * Organization onboarding wizard (3 steps).
 * Final submit creates the organization, then redirects to the dashboard.
 */
export function OrganizationRegistrationForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const formErrorId = useId()

  const [step, setStep] = useState<OrgWizardStep>(1)
  const [state, setState] = useState<OrganizationWizardState>(createInitialState)
  const [basicsErrors, setBasicsErrors] = useState<OrganizationWizardBasicsErrors>({})
  const [companyErrors, setCompanyErrors] = useState<OrganizationWizardCompanyErrors>({})
  const [preferencesErrors, setPreferencesErrors] =
    useState<OrganizationWizardPreferencesErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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

    if (!state.name.trim() || state.name.trim().length < 2) {
      next.name = t('errors.nameRequired')
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

    return next
  }

  function validateCompany(): OrganizationWizardCompanyErrors {
    const next: OrganizationWizardCompanyErrors = {}
    if (!state.industry) next.industry = t('errors.industryRequired')
    if (!state.companySize) next.companySize = t('errors.companySizeRequired')
    if (!state.country) next.country = t('errors.countryRequired')
    if (!state.timezone) next.timezone = t('errors.timezoneRequired')
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

    setPending(true)

    try {
      const payload = buildCreateOrganizationPayload({
        name: state.name,
        slug: state.slug,
        email: state.email,
        phone: state.phone,
        industry: state.industry || undefined,
        country: state.country,
        timezone: state.timezone,
      })

      // Creator becomes owner and the org becomes the session's active organization.
      await api.organizations.create(payload)
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
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      const apiError = err as ApiError

      if (apiError.status === 401) {
        setError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }

      const message = apiError.message || t('errors.generic')
      if (/slug/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, slug: message }))
        setStep(1)
      } else if (/email/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, email: message }))
        setStep(1)
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

    await handleCreateWorkspace()
  }

  const stepperSteps = [
    { id: 1 as const, label: t('steps.basics') },
    { id: 2 as const, label: t('steps.company') },
    { id: 3 as const, label: t('steps.preferences') },
  ]

  return (
    <AuthLayout branding={<AuthBranding variant="organization" />}>
      <form
        className={cn('flex w-full min-w-0 flex-col', className)}
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        aria-describedby={error ? formErrorId : undefined}
        {...props}
      >
        <FieldGroup className="gap-7">
          <div className="flex flex-col gap-4 text-left">
            <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow', { step, total: 3 })}
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
            <WorkspacePreferencesStep
              state={state}
              errors={preferencesErrors}
              pending={pending}
              onChange={patchState}
              onClearError={(key) =>
                setPreferencesErrors((prev) => ({ ...prev, [key]: undefined }))
              }
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
            <div className={cn('flex flex-col gap-2.5', step > 1 && 'sm:flex-row-reverse')}>
              <Button
                type="submit"
                disabled={pending}
                aria-busy={pending}
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
                  disabled={pending}
                  className={cn(authOutlineButtonClassName, 'sm:flex-1')}
                  onClick={() => {
                    setError(null)
                    setStep((prev) => (prev === 3 ? 2 : 1))
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('back')}
                </Button>
              ) : null}
            </div>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
