'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AccessContext, type OrganizationSummary } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import {
  forceRemintAccessToken,
  getValidAccessToken,
  peekAccessTokenOrgId,
} from '@/lib/access-token'
import { ONBOARDING_PAYMENT_PATH } from '@/lib/onboarding'
import {
  isOrganizationRequiredProfileComplete,
  ORG_PROFILE_PATH,
} from '@/lib/organization-profile'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { queryKeys } from '@/lib/query-keys'
import { usePathname, useRouter } from '@/i18n/navigation'

const EMPTY_ORGANIZATIONS: OrganizationSummary[] = []

type OrganizationsContextValue = {
  organizations: OrganizationSummary[]
  activeOrganization: OrganizationSummary | null
  activeOrganizationId: string | null
  /**
   * Session-backed org id that tenant APIs (contacts, members, …) will use.
   * Null while the UI selection is ahead of set-active (avoids stale RLS reads).
   */
  tenantOrganizationId: string | null
  accessContext: AccessContext | null
  /** Flat permission list from GET /api/v1/access-context. */
  permissions: string[]
  /** True when the active membership role is owner. */
  isOwner: boolean
  hasOrganizations: boolean
  /** Convenience flags — derived only from permission keys, never role names. */
  canManageSettings: boolean
  canDeleteOrganization: boolean
  canViewOrg: boolean
  canViewTeam: boolean
  canInviteMembers: boolean
  canAssignRole: boolean
  canRemoveMember: boolean
  canViewRoles: boolean
  canManageRoles: boolean
  canViewContacts: boolean
  canCreateContacts: boolean
  canDeleteContacts: boolean
  canImportContacts: boolean
  canViewInbox: boolean
  canViewWhatsapp: boolean
  canConnectWhatsapp: boolean
  canManageWhatsapp: boolean
  canViewTemplates: boolean
  canCreateTemplates: boolean
  canSyncTemplates: boolean
  canDeleteTemplates: boolean
  canViewCampaigns: boolean
  canCreateCampaigns: boolean
  canEditCampaigns: boolean
  canDeleteCampaigns: boolean
  canLaunchCampaigns: boolean
  canPauseCampaigns: boolean
  canViewBilling: boolean
  canManageBilling: boolean
  isLoading: boolean
  /**
   * True until session/orgs/access-context are ready for permission checks.
   * Includes in-flight organization activate/switch (when accessContext is cleared).
   */
  isResolvingAccess: boolean
  error: string | null
  refresh: () => Promise<{
    organizations: OrganizationSummary[]
    activeId: string | null
  }>
  selectOrganization: (organizationId: string) => Promise<void>
}

const OrganizationsContext = createContext<OrganizationsContextValue | null>(null)

function unwrapList(
  data: { data?: OrganizationSummary[] } | OrganizationSummary[] | undefined
): OrganizationSummary[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function unwrapContext(
  data: ({ data?: AccessContext } & AccessContext) | undefined
): AccessContext | null {
  if (!data) return null
  return data.data ?? (data.organizationId ? data : null)
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function readSessionOrganizationId(
  session: { activeOrganizationId?: string | null } | null | undefined
): string | null {
  return session?.activeOrganizationId ?? null
}

function orgInList(
  organizations: OrganizationSummary[],
  organizationId: string | null
): string | null {
  if (!organizationId) return null
  return organizations.some((org) => org.id === organizationId) ? organizationId : null
}

/**
 * Access context returns 403 until the session has an active organization,
 * which is a normal state right after signup — not an error.
 */
async function fetchAccessContext(): Promise<AccessContext | null> {
  try {
    const { data } = await api.access.context()
    return unwrapContext(data)
  } catch {
    return null
  }
}

async function fetchOrganizationList(): Promise<OrganizationSummary[]> {
  const { data } = await api.organizations.list()
  return unwrapList(data)
}

async function refreshSharedSession(): Promise<string | null> {
  const result = await authClient.getSession({ query: { disableCookieCache: true } })
  return readSessionOrganizationId(result.data?.session)
}

/** Ensure in-memory JWT org_id matches the selected organization. */
async function ensureAccessTokenForOrganization(organizationId: string): Promise<void> {
  await getValidAccessToken()
  if (peekAccessTokenOrgId() === organizationId) return

  await forceRemintAccessToken()
  if (peekAccessTokenOrgId() !== organizationId) {
    throw new Error('Access token organization did not match the selected organization')
  }
}

/**
 * Server-backed source of truth for the signed-in user's organizations.
 * Active org: Better Auth session, then access-context (JWT remint may update either).
 */
export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const { data: sessionData, isPending: sessionPending } = authClient.useSession()
  const sessionOrgId = readSessionOrganizationId(sessionData?.session)
  const isSignedIn = Boolean(sessionData?.user)
  const userId = sessionData?.user?.id ?? null
  const previousUserIdRef = useRef<string | null>(userId)

  // Drop cached orgs/permissions when the signed-in user changes (account switch).
  useEffect(() => {
    if (previousUserIdRef.current === userId) return
    previousUserIdRef.current = userId
    queryClient.removeQueries({ queryKey: queryKeys.organizations.all })
  }, [userId, queryClient])

  /** Optimistic UI selection while set-active + session remint are in flight. */
  const [pendingActiveId, setPendingActiveId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const bootstrapStarted = useRef(false)

  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations.list(userId),
    queryFn: fetchOrganizationList,
    enabled: isSignedIn,
  })

  const organizations = orgsQuery.data ?? EMPTY_ORGANIZATIONS

  // Always load access-context when signed in (403 → null is fine). Do not gate on
  // session.activeOrganizationId — Better Auth client often omits that field briefly
  // after login, which previously left KPIs/switcher stuck forever.
  const accessQuery = useQuery({
    queryKey: queryKeys.organizations.accessContext(userId),
    queryFn: fetchAccessContext,
    enabled: isSignedIn,
  })

  // Ignore stale local switch/bootstrap state after logout.
  const livePendingActiveId = isSignedIn ? pendingActiveId : null
  const liveSwitchError = isSignedIn ? switchError : null
  const liveBootstrapping = isSignedIn && isBootstrapping

  const resolvedActiveId =
    orgInList(organizations, livePendingActiveId) ??
    orgInList(organizations, sessionOrgId) ??
    orgInList(organizations, accessQuery.data?.organizationId ?? null)

  const activeId = resolvedActiveId

  // During an in-flight switch/bootstrap, hide access context so tenant pages pause.
  const accessContext =
    livePendingActiveId && livePendingActiveId !== accessQuery.data?.organizationId
      ? null
      : (accessQuery.data ?? null)

  // Pending orgs must complete payment before using the dashboard.
  useEffect(() => {
    if (!accessContext || accessContext.status !== 'pending_setup') return
    if (
      pathname.startsWith('/onboarding/payment') ||
      pathname.startsWith('/onboarding/organization')
    ) {
      return
    }
    router.replace(ONBOARDING_PAYMENT_PATH)
  }, [accessContext, pathname, router])

  // Reset bootstrap latch when the session drops (logout / account switch).
  useEffect(() => {
    if (!isSignedIn) bootstrapStarted.current = false
  }, [isSignedIn])

  // Memberships exist but session/access-context have no active org yet.
  useEffect(() => {
    if (!isSignedIn || orgsQuery.isLoading || !orgsQuery.data) return
    if (accessQuery.isLoading) return
    if (bootstrapStarted.current || livePendingActiveId) return

    const orgs = orgsQuery.data
    if (orgs.length === 0) {
      bootstrapStarted.current = true
      return
    }

    if (resolvedActiveId) {
      bootstrapStarted.current = true
      return
    }

    const fallbackId = orgs[0]?.id
    if (!fallbackId) return

    bootstrapStarted.current = true

    void (async () => {
      setIsBootstrapping(true)
      setPendingActiveId(fallbackId)
      try {
        await api.organizations.setActive(fallbackId)
        await refreshSharedSession()
        await ensureAccessTokenForOrganization(fallbackId)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.organizations.accessContext(userId),
        })
        setSwitchError(null)
      } catch (err) {
        bootstrapStarted.current = false
        setSwitchError(errorMessage(err, 'Failed to activate organization'))
      } finally {
        setPendingActiveId(null)
        setIsBootstrapping(false)
      }
    })()
  }, [
    isSignedIn,
    userId,
    orgsQuery.isLoading,
    orgsQuery.data,
    accessQuery.isLoading,
    resolvedActiveId,
    livePendingActiveId,
    queryClient,
  ])

  async function refresh() {
    try {
      await refreshSharedSession()
      const nextOrgs = await queryClient.fetchQuery({
        queryKey: queryKeys.organizations.list(userId),
        queryFn: fetchOrganizationList,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.accessContext(userId),
      })

      const nextSessionOrgId = await refreshSharedSession()
      const access = await queryClient.fetchQuery({
        queryKey: queryKeys.organizations.accessContext(userId),
        queryFn: fetchAccessContext,
      })
      const nextActiveId =
        orgInList(nextOrgs, nextSessionOrgId) ?? orgInList(nextOrgs, access?.organizationId ?? null)

      setSwitchError(null)
      return { organizations: nextOrgs, activeId: nextActiveId }
    } catch (err) {
      setSwitchError(errorMessage(err, 'Failed to load organizations'))
      return { organizations: [], activeId: null }
    }
  }

  async function selectOrganization(organizationId: string) {
    if (organizationId === activeId && !livePendingActiveId) return

    setPendingActiveId(organizationId)
    setSwitchError(null)

    try {
      // set-active remints JWT via set-auth-jwt (applied in api.ts).
      await api.organizations.setActive(organizationId)
      await ensureAccessTokenForOrganization(organizationId)
      // Best-effort session store sync — do not fail the switch if the client
      // omits activeOrganizationId; access-context + JWT are authoritative.
      await refreshSharedSession().catch(() => null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.accessContext(userId),
      })
    } catch (err) {
      setSwitchError(errorMessage(err, 'Failed to switch organization'))
      throw err instanceof Error ? err : new Error(errorMessage(err, 'Failed to switch organization'))
    } finally {
      setPendingActiveId(null)
    }
  }

  const activeOrganization = activeId
    ? (organizations.find((org) => org.id === activeId) ?? null)
    : null

  // Required profile fields: owner-only gate before dashboard (invitees are never blocked).
  useEffect(() => {
    if (!accessContext || accessContext.status === 'pending_setup') return
    if (!activeOrganization) return
    if (pathname.startsWith(ORG_PROFILE_PATH)) return
    if (!pathname.startsWith('/dashboard')) return
    if (!accessContext.isOwner) return
    if (isOrganizationRequiredProfileComplete(activeOrganization)) return

    router.replace(ORG_PROFILE_PATH)
  }, [accessContext, activeOrganization, pathname, router])

  const sessionOrgFromContext = accessContext?.organizationId ?? null
  const activeOrgId = activeOrganization?.id ?? null
  const orgAligned = Boolean(isSignedIn && activeOrgId && sessionOrgFromContext === activeOrgId)
  // Derive readiness when JWT already matches — avoids sync setState in an effect.
  const jwtAlreadyReady = orgAligned && peekAccessTokenOrgId() === activeOrgId

  // Remint/align JWT before exposing tenantOrganizationId so first tenant calls
  // (e.g. /members) do not race with a stale or missing Bearer token.
  const [remintedForOrgId, setRemintedForOrgId] = useState<string | null>(null)
  useEffect(() => {
    if (!orgAligned || !activeOrgId) return
    if (peekAccessTokenOrgId() === activeOrgId) return

    let cancelled = false
    void ensureAccessTokenForOrganization(activeOrgId)
      .then(() => {
        if (!cancelled) setRemintedForOrgId(activeOrgId)
      })
      .catch(() => {
        if (!cancelled) setRemintedForOrgId(null)
      })

    return () => {
      cancelled = true
    }
  }, [orgAligned, activeOrgId])

  const tokenReadyOrgId = jwtAlreadyReady || remintedForOrgId === activeOrgId ? activeOrgId : null

  const tenantOrganizationId =
    sessionOrgFromContext &&
    activeOrgId &&
    sessionOrgFromContext === activeOrgId &&
    tokenReadyOrgId === activeOrgId
      ? sessionOrgFromContext
      : null

  const permissions = accessContext?.permissions ?? []
  const listError = orgsQuery.error
    ? errorMessage(orgsQuery.error, 'Failed to load organizations')
    : null

  const value: OrganizationsContextValue = {
    organizations,
    activeOrganization,
    activeOrganizationId: activeOrganization?.id ?? null,
    tenantOrganizationId,
    accessContext,
    permissions,
    isOwner: Boolean(accessContext?.isOwner),
    hasOrganizations: organizations.length > 0,
    canViewOrg: hasPermission(permissions, PERMISSIONS.ORG_VIEW),
    canManageSettings: hasPermission(permissions, PERMISSIONS.ORG_SETTINGS_MANAGE),
    canDeleteOrganization: hasPermission(permissions, PERMISSIONS.ORG_DELETE),
    canViewTeam: hasPermission(permissions, PERMISSIONS.TEAM_VIEW),
    canInviteMembers: hasPermission(permissions, PERMISSIONS.TEAM_INVITE),
    canAssignRole: hasPermission(permissions, PERMISSIONS.TEAM_ROLE_ASSIGN),
    canRemoveMember: hasPermission(permissions, PERMISSIONS.TEAM_REMOVE),
    canViewRoles:
      hasPermission(permissions, PERMISSIONS.ROLES_VIEW) ||
      hasPermission(permissions, PERMISSIONS.TEAM_VIEW),
    canManageRoles: hasPermission(permissions, PERMISSIONS.ROLES_MANAGE),
    canViewContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_VIEW),
    canCreateContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_CREATE),
    canDeleteContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_DELETE),
    canImportContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_IMPORT),
    canViewInbox: hasPermission(permissions, PERMISSIONS.INBOX_VIEW),
    canViewWhatsapp: hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW),
    canConnectWhatsapp: hasPermission(permissions, PERMISSIONS.WHATSAPP_CONNECT),
    canManageWhatsapp: hasPermission(permissions, PERMISSIONS.WHATSAPP_MANAGE),
    canViewTemplates:
      hasPermission(permissions, PERMISSIONS.TEMPLATES_VIEW) ||
      hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW),
    canCreateTemplates:
      hasPermission(permissions, PERMISSIONS.TEMPLATES_CREATE) ||
      hasPermission(permissions, PERMISSIONS.WHATSAPP_MANAGE),
    canSyncTemplates:
      hasPermission(permissions, PERMISSIONS.TEMPLATES_SYNC) ||
      hasPermission(permissions, PERMISSIONS.WHATSAPP_MANAGE),
    canDeleteTemplates:
      hasPermission(permissions, PERMISSIONS.TEMPLATES_DELETE) ||
      hasPermission(permissions, PERMISSIONS.WHATSAPP_MANAGE),
    canViewCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_VIEW),
    canCreateCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_CREATE),
    canEditCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_EDIT),
    canDeleteCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_DELETE),
    canLaunchCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_LAUNCH),
    canPauseCampaigns: hasPermission(permissions, PERMISSIONS.CAMPAIGNS_PAUSE),
    canViewBilling: hasPermission(permissions, PERMISSIONS.BILLING_VIEW),
    canManageBilling: hasPermission(permissions, PERMISSIONS.BILLING_MANAGE),
    // Shell / list loading — avoid treating access refetch alone as full-shell load.
    isLoading: sessionPending || orgsQuery.isLoading || liveBootstrapping,
    // Permission gates must wait for access-context (and activate/switch) or hard
    // refresh stays on empty permissions / “Checking permissions…”.
    isResolvingAccess:
      sessionPending ||
      orgsQuery.isLoading ||
      liveBootstrapping ||
      Boolean(livePendingActiveId) ||
      (isSignedIn && accessQuery.isLoading) ||
      (isSignedIn &&
        Boolean(activeOrgId) &&
        sessionOrgFromContext === activeOrgId &&
        tokenReadyOrgId !== activeOrgId),
    error: liveSwitchError ?? listError,
    refresh,
    selectOrganization,
  }

  return <OrganizationsContext.Provider value={value}>{children}</OrganizationsContext.Provider>
}

export function useOrganizations(): OrganizationsContextValue {
  const context = useContext(OrganizationsContext)
  if (!context) {
    throw new Error('useOrganizations must be used within an OrganizationsProvider')
  }
  return context
}
