import { getBaseUrl } from '@/lib/api-base'

const SET_AUTH_JWT_HEADER = 'set-auth-jwt'
const CLEAR_AUTH_JWT_HEADER = 'Clear-Auth-Jwt'

/** Treat token as expired this many seconds before `exp`. */
const EXPIRY_SKEW_SECONDS = 45

type JwtPayloadMeta = {
  exp?: number
  org_id?: string
  role?: string
}

let accessToken: string | null = null
let expiresAtMs: number | null = null
let mintInFlight: Promise<string> | null = null

/** Decode JWT payload for metadata only — not signature verification. */
function decodeJwtPayload(token: string): JwtPayloadMeta | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json) as JwtPayloadMeta
  } catch {
    return null
  }
}

function isTokenUsable(): boolean {
  if (!accessToken || expiresAtMs == null) return false
  return Date.now() < expiresAtMs - EXPIRY_SKEW_SECONDS * 1000
}

/**
 * Install a JWT from a response header or mint body.
 * Safe to call with null/empty (no-op).
 */
export function setAccessToken(token: string | null | undefined) {
  if (!token) return
  const meta = decodeJwtPayload(token)
  accessToken = token
  expiresAtMs = meta?.exp != null ? meta.exp * 1000 : null
}

export function clearAccessToken() {
  accessToken = null
  expiresAtMs = null
  mintInFlight = null
}

/** Apply set-auth-jwt / Clear-Auth-Jwt from any API response. */
export function applyAuthTokenHeaders(response: Response) {
  const clear = response.headers.get(CLEAR_AUTH_JWT_HEADER)
  if (clear) {
    clearAccessToken()
    return
  }
  const jwt = response.headers.get(SET_AUTH_JWT_HEADER)
  if (jwt) setAccessToken(jwt)
}

async function mintAccessTokenFromCookie(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Access token can only be minted in the browser')
  }

  const response = await fetch(`${getBaseUrl()}/api/auth/token`, {
    method: 'GET',
    credentials: 'include',
  })

  applyAuthTokenHeaders(response)

  if (!response.ok) {
    clearAccessToken()
    throw new Error('Failed to mint access token')
  }

  if (accessToken && isTokenUsable()) {
    return accessToken
  }

  // Better Auth token route returns { token } in the body.
  try {
    const body = (await response.json()) as { token?: string }
    if (body.token) {
      setAccessToken(body.token)
      return body.token
    }
  } catch {
    // header-only success path already handled
  }

  if (accessToken) return accessToken
  throw new Error('Failed to mint access token')
}

/**
 * Return a usable in-memory JWT, minting via the session cookie when needed.
 * Concurrent callers share one in-flight mint.
 */
export async function getValidAccessToken(): Promise<string> {
  if (isTokenUsable() && accessToken) {
    return accessToken
  }

  if (mintInFlight) return mintInFlight

  mintInFlight = mintAccessTokenFromCookie().finally(() => {
    mintInFlight = null
  })

  return mintInFlight
}

/** Drop the cached token and mint a fresh one from the cookie. */
export async function forceRemintAccessToken(): Promise<string> {
  clearAccessToken()
  return getValidAccessToken()
}

export function peekAccessTokenOrgId(): string | null {
  if (!accessToken) return null
  return decodeJwtPayload(accessToken)?.org_id ?? null
}

/** Role claim from the cached JWT (e.g. `superadmin`) — metadata only. */
export function peekAccessTokenRole(): string | null {
  if (!accessToken) return null
  return decodeJwtPayload(accessToken)?.role ?? null
}
