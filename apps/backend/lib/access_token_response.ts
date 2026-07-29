import type { HttpContext } from '@adonisjs/core/http'
import { mintAccessToken } from '#lib/mint_access_token'

export const SET_AUTH_JWT_HEADER = 'set-auth-jwt'
export const CLEAR_AUTH_JWT_HEADER = 'Clear-Auth-Jwt'

/**
 * Attach a freshly minted access token when minting succeeds.
 * Silently no-ops when minting fails — the domain mutation already committed.
 */
export async function attachRemintedAccessToken(
  ctx: Pick<HttpContext, 'request' | 'response'>,
  sessionId: string
): Promise<void> {
  const user = ctx.request.authUser
  if (!user) return

  const token = await mintAccessToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId,
  })

  if (token) {
    ctx.response.header(SET_AUTH_JWT_HEADER, token)
  }
}

/** Tell Bearer clients to drop their in-memory JWT (no replacement available). */
export function attachClearAccessToken(response: HttpContext['response']): void {
  response.header(CLEAR_AUTH_JWT_HEADER, '1')
}
