'use client'

import { authClient } from '@/lib/auth-client'

export function useAuth() {
  const session = authClient.useSession()

  return {
    session: session.data,
    isLoading: session.isPending,
    isAuthenticated: Boolean(session.data?.user),
    signOut: () => authClient.signOut(),
  }
}
