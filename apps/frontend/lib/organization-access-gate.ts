/**
 * Pure readiness helpers for OrganizationsProvider.
 *
 * Regression notes (login / hard-refresh / empty sidebar):
 * - `tenantOrganizationId` must not wait solely on Better Auth `useSession().activeOrganizationId`
 *   — that field is often stale after set-active until a full reload.
 * - `isResolvingAccess` must stay true while access-context is still loading; otherwise
 *   `usePermissions()` sees `[]` and the sidebar hides modules.
 * - JWT remint may run in parallel with access-context; do not serialize remint behind access.
 */

export type OrganizationAccessGateInput = {
  activeOrgId: string | null
  /** access-context.organizationId when context is exposed to the UI */
  accessContextOrgId: string | null
  sessionOrgId: string | null
  /** Last org that completed set-active + remint in this provider instance */
  activatedOrganizationId: string | null
  tokenReadyOrgId: string | null
  pendingActiveId: string | null
  accessQueryLoading: boolean
  sessionPending: boolean
  orgsLoading: boolean
  bootstrapping: boolean
  isSignedIn: boolean
  /** True when GET access-context finished (success or null/403) */
  accessQueryFetched: boolean
  hasAccessContext: boolean
}

export function sessionConfirmsActiveOrg(input: {
  activeOrgId: string | null
  accessContextOrgId: string | null
  sessionOrgId: string | null
  activatedOrganizationId: string | null
}): boolean {
  const { activeOrgId, accessContextOrgId, sessionOrgId, activatedOrganizationId } = input
  if (!activeOrgId) return false
  return (
    accessContextOrgId === activeOrgId ||
    sessionOrgId === activeOrgId ||
    activatedOrganizationId === activeOrgId
  )
}

export function resolveTenantOrganizationId(input: {
  activeOrgId: string | null
  tokenReadyOrgId: string | null
  accessContextOrgId: string | null
  sessionOrgId: string | null
  activatedOrganizationId: string | null
}): string | null {
  const { activeOrgId, tokenReadyOrgId } = input
  if (!activeOrgId || tokenReadyOrgId !== activeOrgId) return null
  if (!sessionConfirmsActiveOrg(input)) return null
  return activeOrgId
}

export function resolveIsResolvingAccess(
  input: OrganizationAccessGateInput,
  tenantOrganizationId: string | null
): boolean {
  if (input.sessionPending || input.orgsLoading || input.bootstrapping) return true
  if (input.pendingActiveId) return true
  if (!input.isSignedIn) return false

  // Keep permission gates in "loading" until access-context settles — empty permissions
  // otherwise hide sidebar modules after a hard refresh / cold mount.
  if (input.accessQueryLoading) return true
  if (input.activeOrgId && input.tokenReadyOrgId !== input.activeOrgId) return true
  if (input.activeOrgId && !tenantOrganizationId) return true
  if (input.activeOrgId && !input.hasAccessContext && !input.accessQueryFetched) return true
  if (!input.activeOrgId && input.accessQueryLoading) return true

  return false
}
