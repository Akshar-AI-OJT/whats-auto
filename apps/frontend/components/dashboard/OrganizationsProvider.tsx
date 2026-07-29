'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react'
import {
  LOCAL_ORGS_CHANGE_EVENT,
  readLocalOrganizationsState,
  setLocalActiveOrganizationId,
  type LocalOrganization,
} from '@/lib/onboarding'

type OrganizationsContextValue = {
  organizations: LocalOrganization[]
  activeOrganization: LocalOrganization | null
  activeOrganizationId: string | null
  hasOrganizations: boolean
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  selectOrganization: (organizationId: string) => Promise<void>
}

type LocalOrgsSnapshot = {
  organizations: LocalOrganization[]
  activeId: string | null
}

const OrganizationsContext = createContext<OrganizationsContextValue | null>(null)

let cachedSnapshot: LocalOrgsSnapshot = { organizations: [], activeId: null }
let cachedSnapshotKey = ''

function readCachedLocalOrgsSnapshot(): LocalOrgsSnapshot {
  const next = readLocalOrganizationsState()
  const key = JSON.stringify(next)
  if (key === cachedSnapshotKey) return cachedSnapshot
  cachedSnapshotKey = key
  cachedSnapshot = next
  return cachedSnapshot
}

function subscribeLocalOrgs(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const notify = () => {
    // Bust cache so the next getSnapshot returns fresh data.
    cachedSnapshotKey = ''
    onStoreChange()
  }

  window.addEventListener(LOCAL_ORGS_CHANGE_EVENT, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(LOCAL_ORGS_CHANGE_EVENT, notify)
    window.removeEventListener('storage', notify)
  }
}

const SERVER_SNAPSHOT: LocalOrgsSnapshot = { organizations: [], activeId: null }

function getLocalOrgsServerSnapshot(): LocalOrgsSnapshot {
  return SERVER_SNAPSHOT
}

/**
 * Temporary frontend source of truth for workspaces (localStorage).
 * Swap helpers in `@/lib/onboarding` for org APIs when backend auth is ready.
 */
export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeLocalOrgs,
    readCachedLocalOrgsSnapshot,
    getLocalOrgsServerSnapshot
  )

  const refresh = useCallback(async () => {
    cachedSnapshotKey = ''
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(LOCAL_ORGS_CHANGE_EVENT))
    }
  }, [])

  const selectOrganization = useCallback(async (organizationId: string) => {
    setLocalActiveOrganizationId(organizationId)
  }, [])

  const value = useMemo<OrganizationsContextValue>(() => {
    const { organizations, activeId } = snapshot
    const activeOrganization =
      organizations.find((org) => org.id === activeId) ?? organizations[0] ?? null

    return {
      organizations,
      activeOrganization,
      activeOrganizationId: activeOrganization?.id ?? null,
      hasOrganizations: organizations.length > 0,
      isLoading: false,
      error: null,
      refresh,
      selectOrganization,
    }
  }, [snapshot, refresh, selectOrganization])

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
