import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import accessTokenConfig from '#config/access_token'
import { parseScope } from '#lib/access_token_permissions'
import type { AccessTokenClaims, AccessTokenUse } from '#types/access_token'

const jwks = createRemoteJWKSet(new URL(accessTokenConfig.jwksUrl))

export class AccessTokenVerificationError extends Error {
  constructor(
    message: string,
    public readonly code:
      'MISSING_BEARER' | 'INVALID_TOKEN' | 'INVALID_CLAIMS' | 'UNKNOWN_SCOPE' = 'INVALID_TOKEN'
  ) {
    super(message)
    this.name = 'AccessTokenVerificationError'
  }
}

/**
 * Extract the raw token from an Authorization header value.
 * Returns null when the header is absent or not Bearer.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeClaims(payload: JWTPayload): AccessTokenClaims {
  const sub = asString(payload.sub)
  const sid = asString(payload.sid)
  const tokenUse = asString(payload.token_use) as AccessTokenUse | undefined
  const email = asString(payload.email)
  const name = asString(payload.name)
  const scope = typeof payload.scope === 'string' ? payload.scope : undefined
  const pv = asString(payload.pv)
  const iss = asString(payload.iss)
  const aud = payload.aud
  const iat = typeof payload.iat === 'number' ? payload.iat : undefined
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined

  if (
    !sub ||
    !sid ||
    !email ||
    !name ||
    scope === undefined ||
    !pv ||
    !iss ||
    !aud ||
    !iat ||
    !exp
  ) {
    throw new AccessTokenVerificationError(
      'Access token is missing required claims',
      'INVALID_CLAIMS'
    )
  }

  if (tokenUse !== 'access') {
    throw new AccessTokenVerificationError('Access token has invalid token_use', 'INVALID_CLAIMS')
  }

  try {
    parseScope(scope)
  } catch {
    throw new AccessTokenVerificationError(
      'Access token contains unknown permission scopes',
      'UNKNOWN_SCOPE'
    )
  }

  const orgId = asString(payload.org_id)
  const memberId = asString(payload.member_id)
  const roleId = asString(payload.role_id)
  const role = asString(payload.role)

  // Tenant claims are all-or-nothing when any org field is present.
  const hasAnyOrgClaim = Boolean(orgId || memberId || roleId)
  if (hasAnyOrgClaim && (!orgId || !memberId || !roleId || !role)) {
    throw new AccessTokenVerificationError(
      'Access token has incomplete organization claims',
      'INVALID_CLAIMS'
    )
  }

  return {
    sub,
    sid,
    token_use: tokenUse,
    email,
    name,
    org_id: orgId,
    member_id: memberId,
    role_id: roleId,
    role,
    scope,
    pv,
    iss,
    aud,
    iat,
    exp,
  }
}

/**
 * Verify a Better Auth access JWT with local jose + cached remote JWKS.
 * Never log the raw token.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: accessTokenConfig.issuer,
      audience: accessTokenConfig.audience,
      algorithms: [...accessTokenConfig.algorithms],
    })
    return normalizeClaims(payload)
  } catch (error) {
    if (error instanceof AccessTokenVerificationError) throw error
    throw new AccessTokenVerificationError('Access token verification failed', 'INVALID_TOKEN')
  }
}
