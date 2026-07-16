'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, type ApiError, type ProfileUser } from '@/lib/api'

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

export function useAuth(): AuthState {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const { data } = await api.auth.getSession()
      setUser(sessionUserFromPayload(data))
    } catch (err) {
      const apiError = err as ApiError
      setUser(null)
      setError(apiError.message ?? 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.auth.getSession()
        if (!cancelled) {
          setUser(sessionUserFromPayload(data))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          const apiError = err as ApiError
          setUser(null)
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
  }, [])

  return {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    refresh,
    signOut,
  }
}
