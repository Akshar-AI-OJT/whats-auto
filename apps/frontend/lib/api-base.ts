/**
 * Browser / SSR API origin for fetch().
 * Empty → same-origin `/api/...` (local Next rewrite).
 * Absolute NEXT_PUBLIC_API_URL → Railway (or other) backend; needs CORS + exposed JWT headers.
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
}
