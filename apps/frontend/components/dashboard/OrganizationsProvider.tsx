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

const PERM_SETTINGS_MANAGE = 'org:settings_manage'
const PERM_DELETE = 'org:delete'

type OrganizationsContextValue = {
  organizations: OrganizationSummary[]
  activeOrganization: OrganizationSummary | null
  activeOrganizationId: string | null
  accessContext: AccessContext | null
  hasOrganizations: boolean
  canManageSettings: boolean
  canDeleteOrganization: boolean
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
  const activeId =
    activeFromSession && organizations.some((org) => org.id === activeFromSession)
      ? activeFromSession
      : (organizations[0]?.id ?? null)

  return { organizations, activeId, accessContext }
}

function hasPermission(context: AccessContext | null, permission: string) {
  if (!context) return false
  if (context.isOwner) return true
  return context.permissions.includes(permission)
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
      setActiveId(organizationId)
      try {
        await api.organizations.setActive(organizationId)
        const nextContext = await fetchAccessContext()
        setAccessContext(nextContext)
      } catch (err) {
        setActiveId(previousId)
        setError((err as ApiError).message ?? 'Failed to switch workspace')
      }
    },
    [activeId]
  )

  const value = useMemo<OrganizationsContextValue>(() => {
    const activeOrganization =
      organizations.find((org) => org.id === activeId) ?? organizations[0] ?? null

    return {
      organizations,
      activeOrganization,
      activeOrganizationId: activeOrganization?.id ?? null,
      accessContext,
      hasOrganizations: organizations.length > 0,
      canManageSettings: hasPermission(accessContext, PERM_SETTINGS_MANAGE),
      canDeleteOrganization: hasPermission(accessContext, PERM_DELETE),
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
