'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'
import { clearAccessToken } from '@/lib/access-token'
import type { ProfileUser } from '@/lib/api'

type AuthState = {
  user: ProfileUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim() || 'WA'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function toIso(value: Date | string | undefined | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function useAuth(): AuthState {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = authClient.useSession()

  const rawUser = data?.user
  const user: ProfileUser | null = rawUser
    ? {
        id: rawUser.id,
        name: rawUser.name,
        firstname: rawUser.firstname ?? '',
        lastname: rawUser.lastname ?? '',
        email: rawUser.email,
        initials: initialsFrom(rawUser.name, rawUser.email),
        createdAt: toIso(rawUser.createdAt),
        updatedAt: toIso(rawUser.updatedAt),
      }
    : null

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut()
    } finally {
      // Session cookie is gone; in-memory JWT would otherwise stay valid until exp.
      // Clear React Query so the next account does not reuse orgs/permissions/UI cache.
      clearAccessToken()
      queryClient.clear()
    }
  }, [queryClient])

  return {
    user,
    isLoading: isPending,
    isAuthenticated: Boolean(user),
    error: error?.message ?? null,
    refresh,
    signOut,
  }
}
