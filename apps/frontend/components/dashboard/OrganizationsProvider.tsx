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
import { hasPermission, PERMISSIONS } from '@/lib/rbac'

/** Shared query keys for org-scoped cache invalidation after create/switch. */
export const organizationQueryKeys = {
  all: ['organizations'] as const,
  list: () => [...organizationQueryKeys.all, 'list'] as const,
  accessContext: () => [...organizationQueryKeys.all, 'access-context'] as const,
}

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
  canViewInbox: boolean
  isLoading: boolean
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

function orgInList(organizations: OrganizationSummary[], organizationId: string | null): string | null {
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

/** Ensure in-memory JWT org_id matches the selected workspace. */
async function ensureAccessTokenForOrganization(organizationId: string): Promise<void> {
  await getValidAccessToken()
  if (peekAccessTokenOrgId() === organizationId) return

  await forceRemintAccessToken()
  if (peekAccessTokenOrgId() !== organizationId) {
    throw new Error('Access token organization did not match the selected workspace')
  }
}

/**
 * Server-backed source of truth for the signed-in user's workspaces.
 * Active org: Better Auth session, then access-context (JWT remint may update either).
 */
export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: sessionData, isPending: sessionPending } = authClient.useSession()
  const sessionOrgId = readSessionOrganizationId(sessionData?.session)
  const isSignedIn = Boolean(sessionData?.user)

  /** Optimistic UI selection while set-active + session remint are in flight. */
  const [pendingActiveId, setPendingActiveId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const bootstrapStarted = useRef(false)

  const orgsQuery = useQuery({
    queryKey: organizationQueryKeys.list(),
    queryFn: fetchOrganizationList,
    enabled: isSignedIn,
  })

  const organizations = orgsQuery.data ?? EMPTY_ORGANIZATIONS

  // Always load access-context when signed in (403 → null is fine). Do not gate on
  // session.activeOrganizationId — Better Auth client often omits that field briefly
  // after login, which previously left KPIs/switcher stuck forever.
  const accessQuery = useQuery({
    queryKey: organizationQueryKeys.accessContext(),
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
        await queryClient.invalidateQueries({ queryKey: organizationQueryKeys.accessContext() })
        setSwitchError(null)
      } catch (err) {
        bootstrapStarted.current = false
        setSwitchError(errorMessage(err, 'Failed to activate workspace'))
      } finally {
        setPendingActiveId(null)
        setIsBootstrapping(false)
      }
    })()
  }, [
    isSignedIn,
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
        queryKey: organizationQueryKeys.list(),
        queryFn: fetchOrganizationList,
      })
      await queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.accessContext(),
      })

      const nextSessionOrgId = await refreshSharedSession()
      const access = await queryClient.fetchQuery({
        queryKey: organizationQueryKeys.accessContext(),
        queryFn: fetchAccessContext,
      })
      const nextActiveId =
        orgInList(nextOrgs, nextSessionOrgId) ??
        orgInList(nextOrgs, access?.organizationId ?? null)

      setSwitchError(null)
      return { organizations: nextOrgs, activeId: nextActiveId }
    } catch (err) {
      setSwitchError(errorMessage(err, 'Failed to load workspaces'))
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
      await queryClient.invalidateQueries({ queryKey: organizationQueryKeys.accessContext() })
    } catch (err) {
      setSwitchError(errorMessage(err, 'Failed to switch workspace'))
      throw err instanceof Error ? err : new Error(errorMessage(err, 'Failed to switch workspace'))
    } finally {
      setPendingActiveId(null)
    }
  }

  const activeOrganization = activeId
    ? (organizations.find((org) => org.id === activeId) ?? null)
    : null

  const sessionOrgFromContext = accessContext?.organizationId ?? null
  const tenantOrganizationId =
    sessionOrgFromContext &&
    activeOrganization?.id &&
    sessionOrgFromContext === activeOrganization.id
      ? sessionOrgFromContext
      : null

  const permissions = accessContext?.permissions ?? []
  const listError = orgsQuery.error
    ? errorMessage(orgsQuery.error, 'Failed to load workspaces')
    : null

  const value: OrganizationsContextValue = {
    organizations,
    activeOrganization,
    activeOrganizationId: activeOrganization?.id ?? null,
    tenantOrganizationId,
    accessContext,
    permissions,
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
    canViewInbox: hasPermission(permissions, PERMISSIONS.INBOX_VIEW),
    // Do not treat workspace switch / access refetch as full-shell loading.
    isLoading: sessionPending || orgsQuery.isLoading || liveBootstrapping,
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
