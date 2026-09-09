import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { clearAccessToken, setAccessToken } from '@/lib/access-token'
import type { ApiError } from '@/lib/api'

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')

/**
 * Better Auth browser client.
 * Local: no baseURL — same-origin `/api/auth/*` via the Next rewrite.
 * Contabo (cross-origin): NEXT_PUBLIC_API_URL=https://api.ottobot.codecolonies.com (credentials + CORS).
 */
export const authClient = createAuthClient({
  ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
  plugins: [
    inferAdditionalFields({
      user: {
        firstname: { type: 'string' },
        lastname: { type: 'string' },
        isActive: { type: 'boolean' },
        isDeleted: { type: 'boolean' },
      },
      session: {
        activeOrganizationId: { type: 'string', required: false },
      },
    }),
  ],
  fetchOptions: {
    credentials: 'include',
    onSuccess: (ctx) => {
      const jwt = ctx.response.headers.get('set-auth-jwt')
      if (jwt) setAccessToken(jwt)
      if (ctx.response.headers.get('Clear-Auth-Jwt')) clearAccessToken()
    },
  },
})

/** Convert Better Auth `{ data, error }` into thrown ApiError for existing forms. */
export function formatBetterAuthError(
  error: { message?: string | null; status?: number; code?: string | null } | null | undefined
): ApiError {
  return {
    message: error?.message ?? 'Authentication request failed',
    status: error?.status ?? 400,
    code: error?.code ?? undefined,
  }
}

/**
 * Drop a sticky/half-dead session before a fresh sign-in.
 * Stale `session_token` + `session_data` cookies (e.g. after JWKS mint failures)
 * otherwise block login until the user clears cookies manually.
 */
export async function flushAuthCookies(): Promise<void> {
  try {
    await authClient.signOut()
  } catch {
    // No session / network — still clear in-memory JWT below.
  } finally {
    clearAccessToken()
  }
}
