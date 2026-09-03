'use client'

import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError, type CreatedOrganization } from '@/lib/api'
import { ensureAccessTokenForOrganization } from '@/lib/access-token'
import { queryKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import {
  buildCreateOrganizationPayload,
  clearPendingOnboardingContact,
  CREATE_PLACEHOLDER_ADDRESS,
  CREATE_PLACEHOLDER_COUNTRY,
  CREATE_PLACEHOLDER_PAN,
  isValidEmail,
  isValidOrganizationSlug,
  isValidPhone,
  isValidWebsiteUrl,
  markOnboardingChecklistVisible,
  readPendingOnboardingContact,
  savePendingOnboardingOrganizationId,
  ORG_SETUP_PATH,
} from '@/lib/onboarding'
import {
  normalizeAppPath,
  resolvePostAuthPath,
  SUPER_ADMIN_HOME_PATH,
} from '@/lib/post-auth-redirect'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import { authPrimaryButtonClassName } from '@/components/auth/auth-field-styles'
import { useRouter } from '@/i18n/navigation'
import { OrganizationBasicsStep } from './OrganizationBasicsStep'
import { OrganizationOnboardingLayout } from './OrganizationOnboardingLayout'
import type {
  OrganizationWizardBasicsErrors,
  OrganizationWizardState,
} from './organization-wizard-types'

function resolveCreateTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

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
    pan: '',
    gstin: '',
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

function unwrapCreatedOrganization(data: unknown): CreatedOrganization | null {
  if (!data || typeof data !== 'object') return null
  const root = data as { data?: CreatedOrganization } & CreatedOrganization
  if (root.data?.id) return root.data
  if ('id' in root && typeof root.id === 'string') return root
  return null
}

async function alignSessionAfterOrganizationCreate(created: CreatedOrganization): Promise<void> {
  // First org: create already activated the session and may have reminted via set-auth-jwt.
  // Additional org: activate explicitly (also remints via set-auth-jwt).
  // Do NOT call authClient.getSession({ disableCookieCache: true }) here — a failed
  // refresh can clear the Better Auth client session and send the user to /login.
  if (created.sessionActivated === false) {
    await api.organizations.setActive(created.id)
  }
  await ensureAccessTokenForOrganization(created.id)
}

/**
 * Create Organization page — existing Basics UI.
 * After create, go to the dashboard. Company / preferences / plan are completed later.
 */
export function OrganizationRegistrationForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const queryClient = useQueryClient()
  const formErrorId = useId()

  const [state, setState] = useState<OrganizationWizardState>(createInitialState)
  const [basicsErrors, setBasicsErrors] = useState<OrganizationWizardBasicsErrors>({})
  const [guardingInvite, setGuardingInvite] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
        if (normalized === SUPER_ADMIN_HOME_PATH || normalized.startsWith('/admin')) {
          router.replace(nextPath)
          return
        }
      } catch {
        // stay on org setup
      } finally {
        if (!cancelled) setGuardingInvite(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

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

  async function createOrganization(slugOverride?: string) {
    const payload = buildCreateOrganizationPayload({
      name: state.name,
      slug: slugOverride ?? state.slug,
      email: state.email,
      phone: state.phone,
      website: state.website,
      organizationType: 'company',
      address: CREATE_PLACEHOLDER_ADDRESS,
      pan: CREATE_PLACEHOLDER_PAN,
      country: CREATE_PLACEHOLDER_COUNTRY,
      timezone: resolveCreateTimezone(),
      currency: 'INR',
    })

    const { data } = await api.organizations.create(payload)
    const created = unwrapCreatedOrganization(data)
    if (!created?.id) {
      throw new Error('Organization create did not return an id')
    }

    savePendingOnboardingOrganizationId(created.id)
    try {
      await alignSessionAfterOrganizationCreate(created)
    } catch {
      // Org already exists. Prefer landing on the dashboard over bouncing to login
      // when JWT remint fails (e.g. JWKS/secret mismatch); cookie session still works.
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
    clearPendingOnboardingContact()
    markOnboardingChecklistVisible()
    router.replace('/dashboard')
    router.refresh()
  }

  async function handleCreateOrganization() {
    setError(null)
    const nextErrors = validateBasics()
    setBasicsErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)

    try {
      await createOrganization()
    } catch (err) {
      const apiError = err as ApiError

      // Only treat auth failure on the create call itself — never after a successful create.
      if (apiError.status === 401) {
        setError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }

      const message = apiError.message || t('errors.generic')
      if (apiError.code === 'E_ORG_SLUG_ALREADY_EXISTS' || /slug/i.test(message)) {
        try {
          const suffix = Date.now().toString(36).slice(-4)
          await createOrganization(`${state.slug.trim()}-${suffix}`.slice(0, 100))
          return
        } catch {
          setBasicsErrors((prev) => ({ ...prev, slug: message }))
        }
      } else if (/email/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, email: message }))
      } else if (/phone/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, phone: message }))
      } else if (/website/i.test(message)) {
        setBasicsErrors((prev) => ({ ...prev, website: message }))
      }
      setError(message)
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleCreateOrganization()
  }

  if (guardingInvite) {
    return (
      <OrganizationOnboardingLayout variant="create">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      </OrganizationOnboardingLayout>
    )
  }

  return (
    <OrganizationOnboardingLayout variant="create">
      <form
        className={cn('flex w-full min-w-0 flex-col', className)}
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        aria-describedby={error ? formErrorId : undefined}
        {...props}
      >
        <FieldGroup className="gap-8">
          <OrganizationBasicsStep
            state={state}
            errors={basicsErrors}
            pending={pending}
            onChange={patchState}
            onClearError={(key) =>
              setBasicsErrors((prev) => ({ ...prev, [key]: undefined }))
            }
          />

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
            <div className="flex flex-col-reverse gap-3 border-t border-[#CBD5E1] pt-6 sm:flex-col">
              <Button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className={authPrimaryButtonClassName}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>{t('creating')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('continue')}</span>
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>
    </OrganizationOnboardingLayout>
  )
}
