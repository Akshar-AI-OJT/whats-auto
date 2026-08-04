'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, type ApiError, type ProfileUser } from '@/lib/api'
import { clearLegacyOrganizationCache } from '@/lib/onboarding'

type AuthState = {
  user: ProfileUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

function sessionUserFromPayload(data: unknown): ProfileUser | null {
  if (!data || typeof data !== 'object' || !('user' in data)) {
    return null
  }

  return (data as { user: ProfileUser | null }).user ?? null
}

function profileUserFromPayload(data: unknown): ProfileUser | null {
  if (!data || typeof data !== 'object') return null
  const payload = data as { data?: ProfileUser } & Partial<ProfileUser>
  const user = payload.data ?? (payload.id ? (payload as ProfileUser) : null)
  return user?.id ? user : null
}

function isAuthFailure(error: ApiError): boolean {
  return error.status === 401
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUser = useCallback(async (): Promise<ProfileUser | null> => {
    try {
      const { data } = await api.auth.getSession()
      const sessionUser = sessionUserFromPayload(data)
      if (sessionUser) return sessionUser
    } catch {
      // Ignore here; we fallback to account.profile below.
    }

    // Fallback endpoint is often more stable than auth get-session under load.
    const { data } = await api.account.profile()
    return profileUserFromPayload(data)
  }, [])

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const nextUser = await loadUser()
      setUser(nextUser)
    } catch (err) {
      const apiError = err as ApiError
      if (isAuthFailure(apiError)) {
        setUser(null)
      }
      // Keep existing user for transient errors so topbar name doesn't flicker to "Account".
      setError(apiError.message ?? 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }, [loadUser])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      clearLegacyOrganizationCache()
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const nextUser = await loadUser()
        if (!cancelled) {
          setUser(nextUser)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          const apiError = err as ApiError
          if (isAuthFailure(apiError)) {
            setUser(null)
          }
          // Preserve prior user on temporary network/timeouts.
          setError(apiError.message ?? 'Failed to load session')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadUser])

  return {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    refresh,
    signOut,
  }
}
