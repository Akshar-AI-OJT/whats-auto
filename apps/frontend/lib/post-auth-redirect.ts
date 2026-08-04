import { peekAccessTokenRole } from '@/lib/access-token'
import { api, type ApiError } from '@/lib/api'
import { ORG_SETUP_PATH } from '@/lib/onboarding'

/** Platform console home for global superadmin (no tenant org required). */
export const SUPER_ADMIN_HOME_PATH = '/admin/dashboard'

const PENDING_INVITE_KEY = 'wa-pending-invitation-id'

export type OnboardingNextStep =
  | 'accept_invitation'
  | 'create_organization'
  | 'select_organization'
  | 'ready'

export type OnboardingPendingInvitation = {
  id: string
  organizationId?: string
  organizationName: string
  role: string
  inviterName: string
  expiresAt: string
}

export type OnboardingState = {
  activeOrganizationId: string | null
  organizations: Array<{ id: string; name: string; role?: string }>
  pendingInvitations: OnboardingPendingInvitation[]
  nextStep: OnboardingNextStep
}

/** Strip locale prefix so path checks work with /en/... or bare /... */
export function normalizeAppPath(path: string): string {
  const stripped = path.replace(/^\/(en|hi)(?=\/|$)/, '')
  return stripped.length > 0 ? stripped : '/'
}

export function acceptInvitationPath(invitationId: string): string {
  return `/accept-invitation/${invitationId}`
}

export function isAcceptInvitationPath(path: string | null | undefined): boolean {
  if (!path) return false
  return normalizeAppPath(path).startsWith('/accept-invitation/')
}

export function invitationIdFromPath(path: string | null | undefined): string | null {
  if (!path) return null
  const normalized = normalizeAppPath(path)
  const match = normalized.match(/^\/accept-invitation\/([^/?#]+)/)
  return match?.[1] ?? null
}

export function savePendingInvitationId(invitationId: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PENDING_INVITE_KEY, invitationId)
  } catch {
    /* ignore */
  }
}

export function readPendingInvitationId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export function clearPendingInvitationId() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    /* ignore */
  }
}

function unwrapOnboardingState(data: unknown): OnboardingState | null {
  if (!data || typeof data !== 'object') return null
  const root = data as { data?: OnboardingState } & Partial<OnboardingState>
  const state = root.data ?? root
  if (!state || typeof state !== 'object' || !('nextStep' in state)) return null
  return {
    activeOrganizationId: state.activeOrganizationId ?? null,
    organizations: Array.isArray(state.organizations) ? state.organizations : [],
    pendingInvitations: Array.isArray(state.pendingInvitations)
      ? state.pendingInvitations
      : [],
    nextStep: state.nextStep as OnboardingNextStep,
  }
}

/**
 * Single post-login / post-signup router.
 * Prefer backend onboarding state; fall back to stored invite id / callbackURL.
 */
export async function resolvePostAuthPath(options: {
  preferredCallback?: string | null
  /** Used when onboarding state cannot be loaded and no invite context exists. */
  fallback: string
}): Promise<string> {
  const preferred = options.preferredCallback
    ? normalizeAppPath(options.preferredCallback)
    : null

  if (isAcceptInvitationPath(preferred)) {
    const id = invitationIdFromPath(preferred)
    if (id) savePendingInvitationId(id)
    return preferred!
  }

  const storedInviteId = readPendingInvitationId()

  try {
    const { data } = await api.onboarding.state()
    const state = unwrapOnboardingState(data)
    if (state) {
      if (state.nextStep === 'accept_invitation') {
        const id = state.pendingInvitations[0]?.id ?? storedInviteId
        if (id) {
          savePendingInvitationId(id)
          return acceptInvitationPath(id)
        }
      }

      if (
        state.organizations.length === 0 &&
        (state.pendingInvitations[0]?.id || storedInviteId)
      ) {
        const id = state.pendingInvitations[0]?.id ?? storedInviteId!
        savePendingInvitationId(id)
        return acceptInvitationPath(id)
      }

      if (state.nextStep === 'create_organization') {
        // Platform superadmins have no tenant membership — don't send them to create-org.
        if (peekAccessTokenRole() === 'superadmin') {
          clearPendingInvitationId()
          if (preferred?.startsWith('/admin')) return preferred
          return SUPER_ADMIN_HOME_PATH
        }
        // Stale invite id from a previous attempt should not block create-org.
        if (state.pendingInvitations.length === 0) {
          clearPendingInvitationId()
        }
        return ORG_SETUP_PATH
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

  if (storedInviteId) {
    return acceptInvitationPath(storedInviteId)
  }

  if (preferred?.startsWith('/')) {
    return preferred
  }

  return options.fallback
}

/** Build /login or /register href while preserving invite callback (+ email). */
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
