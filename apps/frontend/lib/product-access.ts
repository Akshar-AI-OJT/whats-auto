import { ONBOARDING_PLAN_PATH } from '@/lib/onboarding'
import { organizationProfilePath } from '@/lib/organization-profile'
import { normalizeAppPath } from '@/lib/post-auth-redirect'

/** Sidebar / account destinations that stay available before full product access. */
const UNLOCKED_NAV_KEYS = new Set(['dashboard', 'billing'])

/** Dashboard paths reachable during unpaid / incomplete onboarding ([D70]). */
const UNLOCKED_DASHBOARD_PREFIXES = [
  '/dashboard/billing',
  '/dashboard/profile',
  '/dashboard/whatsapp',
] as const

function stripQueryAndHash(pathname: string): string {
  const withoutHash = pathname.split('#')[0] ?? pathname
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1)
  }
  return withoutQuery
}

/**
 * D70 unlock destinations:
 * - pending_setup → Connect WhatsApp
 * - verified_setup → plan/payment
 * - active + incomplete profile → organization profile
 * - otherwise → plan (legacy unpaid fallback)
 */
export function getProductUnlockPath(input: {
  isSetupComplete: boolean
  organizationStatus?: string | null
  organizationId?: string | null
}): string {
  if (input.organizationStatus === 'pending_setup') {
    return '/dashboard/whatsapp'
  }
  if (input.organizationStatus === 'verified_setup') {
    return ONBOARDING_PLAN_PATH
  }
  if (!input.isSetupComplete) {
    return organizationProfilePath(input.organizationId)
  }
  return ONBOARDING_PLAN_PATH
}

export function isUnlockedNavKey(key: string): boolean {
  return UNLOCKED_NAV_KEYS.has(key)
}

export function isAlwaysAllowedDashboardPath(pathname: string): boolean {
  const path = stripQueryAndHash(normalizeAppPath(pathname))
  if (path === '/dashboard') return true
  return UNLOCKED_DASHBOARD_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

export function resolveDashboardHref(
  href: string,
  input: {
    hasFullProductAccess: boolean
    isSetupComplete: boolean
    organizationStatus?: string | null
    organizationId?: string | null
  }
): string {
  if (input.hasFullProductAccess || isAlwaysAllowedDashboardPath(href)) return href
  return getProductUnlockPath({
    isSetupComplete: input.isSetupComplete,
    organizationStatus: input.organizationStatus,
    organizationId: input.organizationId,
  })
}

/** Unpaid orgs may connect WhatsApp before payment ([D70]). */
export function canAccessWhatsappSetup(organizationStatus?: string | null): boolean {
  return (
    organizationStatus === 'pending_setup' ||
    organizationStatus === 'verified_setup' ||
    organizationStatus === 'active'
  )
}
