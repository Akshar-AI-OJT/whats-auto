/**
 * Access-token claim contract for Better Auth JWT scopes.
 *
 * Minted by AccessTokenClaimsService and verified by access_token_verifier.
 * Keep field names stable — frontend and middleware depend on this shape.
 */
export type AccessTokenUse = 'access'

export type AccessTokenClaims = {
  /** User ID (JWT subject) */
  sub: string
  /** Better Auth session ID */
  sid: string
  /** Distinguishes access tokens from future refresh/id tokens */
  token_use: AccessTokenUse

  email: string
  name: string

  /** Active organization — omitted when no org is selected */
  org_id?: string
  member_id?: string
  role_id?: string
  /** Role name (e.g. owner, admin). owner/superadmin expand scope in memory */
  role?: string

  /**
   * Space-separated Permission values.
   * Empty when no active org (identity-only token).
   * May be empty for owner/superadmin when middleware expands from catalogs.
   */
  scope: string

  /**
   * Monotonic permission version from the authoritative grant row.
   * Required for tenant and platform tokens; omitted for identity-only tokens.
   */
  pv?: number

  iss: string
  aud: string | string[]
  iat: number
  exp: number
}

/**
 * Payload returned by definePayload before jose/Better Auth adds iss/aud/iat/exp.
 * `sub` is set via getSubject; callers still include identity fields here.
 */
export type AccessTokenPayload = Omit<AccessTokenClaims, 'iss' | 'aud' | 'iat' | 'exp'>
