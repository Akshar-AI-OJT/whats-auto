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

type OrganizationsContextValue = {
  organizations: OrganizationSummary[]
  activeOrganization: OrganizationSummary | null
  activeOrganizationId: string | null
  hasOrganizations: boolean
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
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
async function fetchActiveOrganizationId(): Promise<string | null> {
  try {
    const { data } = await api.access.context()
    return unwrapContext(data)?.organizationId ?? null
  } catch {
    return null
  }
}

async function fetchOrganizationsState(): Promise<{
  organizations: OrganizationSummary[]
  activeId: string | null
}> {
  const [listResult, activeOrganizationId] = await Promise.all([
    api.organizations.list(),
    fetchActiveOrganizationId(),
  ])

  const organizations = unwrapList(listResult.data)
  const activeId =
    activeOrganizationId && organizations.some((org) => org.id === activeOrganizationId)
      ? activeOrganizationId
      : (organizations[0]?.id ?? null)

  return { organizations, activeId }
}

/**
 * Server-backed source of truth for the signed-in user's workspaces.
 * The organizations API is membership-scoped, so switching accounts can never
 * leak another user's workspaces into the switcher.
 */
export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchOrganizationsState()
      setOrganizations(next.organizations)
      setActiveId(next.activeId)
      setError(null)
    } catch (err) {
      setOrganizations([])
      setActiveId(null)
      setError((err as ApiError).message ?? 'Failed to load workspaces')
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
        setError(null)
      } catch (err) {
        if (cancelled) return
        setOrganizations([])
        setActiveId(null)
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
      hasOrganizations: organizations.length > 0,
      isLoading,
      error,
      refresh,
      selectOrganization,
    }
  }, [organizations, activeId, isLoading, error, refresh, selectOrganization])

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
