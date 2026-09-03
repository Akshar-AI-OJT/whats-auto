import { ONBOARDING_PLAN_PATH } from '@/lib/onboarding'
import { ORG_PROFILE_PATH } from '@/lib/organization-profile'
import { normalizeAppPath } from '@/lib/post-auth-redirect'

/** Sidebar / account destinations that stay available before setup + subscription. */
const UNLOCKED_NAV_KEYS = new Set(['dashboard', 'billing'])

/** Dashboard paths that do not require completed setup + an active subscription. */
const UNLOCKED_DASHBOARD_PREFIXES = ['/dashboard/billing', '/dashboard/profile'] as const

function stripQueryAndHash(pathname: string): string {
  const withoutHash = pathname.split('#')[0] ?? pathname
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1)
  }
  return withoutQuery
}

/** Setup incomplete → profile. Setup done + unpaid → onboarding plan (not dashboard billing). */
export function getProductUnlockPath(input: { isSetupComplete: boolean }): string {
  return input.isSetupComplete ? ONBOARDING_PLAN_PATH : ORG_PROFILE_PATH
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

export function resolveDashboardHref(href: string, input: {
  hasFullProductAccess: boolean
  isSetupComplete: boolean
}): string {
  if (input.hasFullProductAccess || isAlwaysAllowedDashboardPath(href)) return href
  return getProductUnlockPath({ isSetupComplete: input.isSetupComplete })
}
