/**
 * Browser / SSR API origin for fetch().
 * Empty → same-origin `/api/...` (local Next rewrite only).
 * Contabo: set NEXT_PUBLIC_API_URL=https://api.yourdomain.com (CORS + JWT headers).
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
}
