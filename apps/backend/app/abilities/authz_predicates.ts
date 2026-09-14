import type { AuthzPrincipal } from '#types/http'

const ORG_ADMIN_ROLES = new Set(['admin', 'owner'])

/** Shared predicate for org-admin role checks (policies + abilities). */
export function isOrgAdmin(user: AuthzPrincipal): boolean {
  return ORG_ADMIN_ROLES.has(user.activeMember?.role ?? '')
}

/**
 * Platform access after `platform` middleware has hydrated `memberPermissions`.
 * Any `platform:*` grant (superadmin expands the full catalog).
 */
export function isPlatformActor(user: AuthzPrincipal): boolean {
  if (!user.memberPermissions || user.memberPermissions.size === 0) return false
  for (const permission of user.memberPermissions) {
    if (permission.startsWith('platform:')) return true
  }
  return false
}
