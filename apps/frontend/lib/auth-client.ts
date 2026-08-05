import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { clearAccessToken, setAccessToken } from '@/lib/access-token'
import type { ApiError } from '@/lib/api'

/**
 * Better Auth browser client.
 * No baseURL — same-origin `/api/auth/*` goes through the Next rewrite.
 */
export const authClient = createAuthClient({
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
