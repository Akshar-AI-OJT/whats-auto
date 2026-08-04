/**
 * Browser API origin for fetch().
 * Empty string → same-origin relative `/api/...` (Next rewrite).
 * Absolute NEXT_PUBLIC_API_URL → cross-origin override (needs CORS + exposed JWT headers).
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}
