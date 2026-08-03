'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  api,
  type AccessContext,
  type ApiError,
  type OrganizationSummary,
} from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'

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

async function fetchOrganizationsState(): Promise<{
  organizations: OrganizationSummary[]
  activeId: string | null
  accessContext: AccessContext | null
}> {
  const [listResult, accessContext] = await Promise.all([
    api.organizations.list(),
    fetchAccessContext(),
  ])

  const organizations = unwrapList(listResult.data)
  const activeFromSession = accessContext?.organizationId ?? null
  let activeId =
    activeFromSession && organizations.some((org) => org.id === activeFromSession)
      ? activeFromSession
      : (organizations[0]?.id ?? null)

  let nextContext = accessContext

  // New logins often have memberships but no session activeOrganizationId.
  // Persist the UI fallback so tenant APIs (members, invites, etc.) work.
  if (activeId && activeId !== activeFromSession) {
    try {
      await api.organizations.setActive(activeId)
      nextContext = await fetchAccessContext()
    } catch {
      // Keep the UI selection; tenant calls may still fail until manual switch.
    }
  }

  return { organizations, activeId, accessContext: nextContext }
}

/**
 * Server-backed source of truth for the signed-in user's workspaces.
 * The organizations API is membership-scoped, so switching accounts can never
 * leak another user's workspaces into the switcher.
 */
export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [accessContext, setAccessContext] = useState<AccessContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchOrganizationsState()
      setOrganizations(next.organizations)
      setActiveId(next.activeId)
      setAccessContext(next.accessContext)
      setError(null)
      return { organizations: next.organizations, activeId: next.activeId }
    } catch (err) {
      setOrganizations([])
      setActiveId(null)
      setAccessContext(null)
      setError((err as ApiError).message ?? 'Failed to load workspaces')
      return { organizations: [], activeId: null }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const next = await fetchOrganizationsState()
        if (cancelled) return
        setOrganizations(next.organizations)
        setActiveId(next.activeId)
        setAccessContext(next.accessContext)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setOrganizations([])
        setActiveId(null)
        setAccessContext(null)
        setError((err as ApiError).message ?? 'Failed to load workspaces')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      const previousId = activeId
      const previousContext = accessContext
      // Optimistic UI + clear session context so tenant pages stop using the
      // previous org while set-active is in flight.
      setActiveId(organizationId)
      setAccessContext(null)
      try {
        await api.organizations.setActive(organizationId)
        const nextContext = await fetchAccessContext()
        setAccessContext(nextContext)
      } catch (err) {
        setActiveId(previousId)
        setAccessContext(previousContext)
        setError((err as ApiError).message ?? 'Failed to switch workspace')
      }
    },
    [activeId, accessContext]
  )

  const value = useMemo<OrganizationsContextValue>(() => {
    const activeOrganization =
      organizations.find((org) => org.id === activeId) ?? organizations[0] ?? null

    const sessionOrgId = accessContext?.organizationId ?? null
    // Only expose a tenant id when UI selection and session agree — prevents
    // fetching contacts/members against the previous org during set-active.
    const tenantOrganizationId =
      sessionOrgId && sessionOrgId === activeOrganization?.id ? sessionOrgId : null

    const permissions = accessContext?.permissions ?? []

    return {
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
      // Roles list API is under the team:view group middleware; roles:view is the
      // product catalog flag. Show Roles when either is present so custom grants work.
      canViewRoles:
        hasPermission(permissions, PERMISSIONS.ROLES_VIEW) ||
        hasPermission(permissions, PERMISSIONS.TEAM_VIEW),
      canManageRoles: hasPermission(permissions, PERMISSIONS.ROLES_MANAGE),
      canViewContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_VIEW),
      canCreateContacts: hasPermission(permissions, PERMISSIONS.CONTACTS_CREATE),
      isLoading,
      error,
      refresh,
      selectOrganization,
    }
  }, [
    organizations,
    activeId,
    accessContext,
    isLoading,
    error,
    refresh,
    selectOrganization,
  ])

  return (
    <OrganizationsContext.Provider value={value}>
      {children}
    </OrganizationsContext.Provider>
  )
}

export function useOrganizations(): OrganizationsContextValue {
  const context = useContext(OrganizationsContext)
  if (!context) {
    throw new Error('useOrganizations must be used within an OrganizationsProvider')
  }
  return context
}
