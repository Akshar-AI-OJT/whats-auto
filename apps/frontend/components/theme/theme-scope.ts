/**
 * Dark mode is for app shells only (dashboard / admin).
 * Marketing, auth, and onboarding use hardcoded light surfaces with
 * semantic tokens (text-ink, bg-canvas) — html.dark makes those unreadable.
 */
export const APP_DARK_THEME_PATH_RE = /(?:^|\/)(?:dashboard|admin)(?:\/|$)/

export function pathAllowsDarkTheme(pathname: string): boolean {
  return APP_DARK_THEME_PATH_RE.test(pathname)
}
