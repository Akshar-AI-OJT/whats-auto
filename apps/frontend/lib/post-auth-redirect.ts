import { peekAccessTokenRole } from '@/lib/access-token'
import { api, type ApiError } from '@/lib/api'
import { ONBOARDING_PLAN_PATH, ORG_SETUP_PATH } from '@/lib/onboarding'
import { organizationProfilePath } from '@/lib/organization-profile'

/** Platform console home for global superadmin (no tenant org required). */
export const SUPER_ADMIN_HOME_PATH = '/admin/dashboard'

/**
 * Post-OAuth landing that runs {@link resolvePostAuthPath} (email login already
 * does this client-side). Keeps Google from hard-landing on `/dashboard`.
 */
export const AUTH_CONTINUE_PATH = '/auth/continue'

export type OnboardingNextStep =
  | 'create_organization'
  | 'select_organization'
  | 'connect_whatsapp'
  | 'complete_payment'
  | 'complete_profile'
  | 'ready'

export type OnboardingState = {
  activeOrganizationId: string | null
  organizations: Array<{ id: string; name: string; role?: string }>
  nextStep: OnboardingNextStep
}

/** Strip locale prefix so path checks work with /en/... or bare /... */
export function normalizeAppPath(path: string): string {
  const stripped = path.replace(/^\/(en|hi)(?=\/|$)/, '')
  return stripped.length > 0 ? stripped : '/'
}

function unwrapOnboardingState(data: unknown): OnboardingState | null {
  if (!data || typeof data !== 'object') return null
  const root = data as { data?: OnboardingState } & Partial<OnboardingState>
  const state = root.data ?? root
  if (!state || typeof state !== 'object' || !('nextStep' in state)) return null
  return {
    activeOrganizationId: state.activeOrganizationId ?? null,
    organizations: Array.isArray(state.organizations) ? state.organizations : [],
    nextStep: state.nextStep as OnboardingNextStep,
  }
}

/**
 * Single post-login / post-signup router ([D70]).
 * Prefer backend onboarding state; fall back to callbackURL.
 */
export async function resolvePostAuthPath(options: {
  preferredCallback?: string | null
  /** Used when onboarding state cannot be loaded. */
  fallback: string
}): Promise<string> {
  const preferred = options.preferredCallback ? normalizeAppPath(options.preferredCallback) : null

  try {
    const { data } = await api.onboarding.state()
    const state = unwrapOnboardingState(data)
    if (state) {
      if (state.nextStep === 'create_organization') {
        if (peekAccessTokenRole() === 'superadmin') {
          if (preferred?.startsWith('/admin')) return preferred
          return SUPER_ADMIN_HOME_PATH
        }
        return ORG_SETUP_PATH
      }

      if (state.nextStep === 'connect_whatsapp') {
        return '/dashboard/whatsapp'
      }

      if (state.nextStep === 'complete_payment') {
        return ONBOARDING_PLAN_PATH
      }

      if (state.nextStep === 'complete_profile') {
        return organizationProfilePath(state.activeOrganizationId)
      }

      if (peekAccessTokenRole() === 'superadmin' && state.organizations.length === 0) {
        if (preferred?.startsWith('/admin')) return preferred
        return SUPER_ADMIN_HOME_PATH
      }

      return '/dashboard'
    }
  } catch (err) {
    const status = (err as ApiError)?.status
    if (status === 401) {
      return preferred ?? options.fallback
    }
  }

  if (preferred?.startsWith('/')) {
    return preferred
  }

  return options.fallback
}

/** Only allow same-origin relative paths (blocks open redirects). */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return normalizeAppPath(raw)
}

/**
 * OAuth success URL → `/auth/continue` (optionally carrying a preferred callback).
 */
export function authContinuePath(preferredCallback?: string | null): string {
  const preferred = safeCallbackPath(preferredCallback)
  if (!preferred) return AUTH_CONTINUE_PATH
  const params = new URLSearchParams()
  params.set('callbackURL', preferred)
  return `${AUTH_CONTINUE_PATH}?${params.toString()}`
}

/** Build /login or /register href while preserving callback (+ email). */
export function authHandoffHref(
  path: '/login' | '/register',
  options?: { callbackPath?: string | null; email?: string | null }
): string {
  const params = new URLSearchParams()
  if (options?.callbackPath) {
    params.set('callbackURL', normalizeAppPath(options.callbackPath))
  }
  if (options?.email?.trim()) {
    params.set('email', options.email.trim())
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}
