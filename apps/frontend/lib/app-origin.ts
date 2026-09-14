/**
 * Absolute frontend origin for auth redirects (OAuth callbackURL / errorCallbackURL).
 * Prefer the live browser origin so missing NEXT_PUBLIC_APP_URL cannot produce
 * `undefined/en/...` URLs in client components.
 */
export function getBrowserAppOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

/** Build `https://app/{locale}{path}` (path should start with `/`). */
export function buildLocalizedAppUrl(locale: string, path: string): string {
  const origin = getBrowserAppOrigin()
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${origin}/${locale}${normalized}`
}
