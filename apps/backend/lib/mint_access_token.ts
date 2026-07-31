import logger from '@adonisjs/core/services/logger'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

type MintInput = {
  userId: string
  email: string
  name: string
  sessionId: string
}

/**
 * Mint a signed access JWT after an auth-context mutation has committed.
 * Uses AccessTokenClaimsService so claim construction stays in one place.
 * Never throws — a mint failure must not undo a successful domain write.
 */
export async function mintAccessToken(input: MintInput): Promise<string | null> {
  try {
    const payload = await new AccessTokenClaimsService().build({
      user: {
        id: input.userId,
        email: input.email,
        name: input.name,
      },
      session: { id: input.sessionId },
    })

    const result = await auth.api.signJWT({
      body: {
        payload: payload as Record<string, any>,
      },
    })

    const token = (result as { token?: string } | null)?.token
    return typeof token === 'string' && token.length > 0 ? token : null
  } catch (error) {
    logger.warn(
      { err: error, userId: input.userId, sessionId: input.sessionId },
      'Failed to mint access token after auth context change'
    )
    return null
  }
}
