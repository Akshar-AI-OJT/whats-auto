import env from '#start/env'

/**
 * Single source of truth for access-token minting and verification.
 * Better Auth jwt() plugin and jose verifier must both read from here.
 */
const betterAuthUrl = env.get('BETTER_AUTH_URL').replace(/\/$/, '')

/**
 * Better Auth serves JWKS at /api/auth/jwks (basePath + jwt plugin jwksPath).
 * Override only if the Better Auth base path or jwksPath changes.
 */
export const JWKS_PATH = '/api/auth/jwks'

const accessTokenConfig = {
  issuer: env.get('JWT_ISSUER'),
  audience: env.get('JWT_AUDIENCE'),
  /**
   * jose / Better Auth duration string, e.g. "15m", "1h".
   * Keep shorter than or equal to session lifetime.
   */
  expirationTime: env.get('JWT_ACCESS_TOKEN_TTL'),
  /** Absolute JWKS URL used by createRemoteJWKSet */
  jwksUrl: `${betterAuthUrl}${JWKS_PATH}`,
  /** Relative path (for docs / Better Auth plugin alignment) */
  jwksPath: JWKS_PATH,
  /** Accepted signing algorithms (Better Auth default is EdDSA) */
  algorithms: ['EdDSA'] as const,
} as const

export default accessTokenConfig
