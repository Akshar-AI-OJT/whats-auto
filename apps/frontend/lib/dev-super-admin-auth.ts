/**
 * TEMPORARY — development-only Super Admin bypass.
 *
 * Client-side credential check against NEXT_PUBLIC_SUPER_ADMIN_* env vars.
 * Does not call the backend or create a tenant session.
 *
 * Remove this module (and its single call site in login-form) when the
 * backend supports a `super_admin` role and issues a proper session.
 */

export const DEV_SUPER_ADMIN_DASHBOARD_PATH = '/admin/dashboard'
const DEV_SUPER_ADMIN_SESSION_KEY = 'wa-dev-super-admin-session'

/**
 * Returns true when both env vars are set and the submitted credentials match.
 * Missing env config never matches (tenant login proceeds as usual).
 */
export function matchesDevSuperAdminCredentials(
  email: string,
  password: string
): boolean {
  const expectedEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim()
  const expectedPassword = process.env.NEXT_PUBLIC_SUPER_ADMIN_PASSWORD

  if (!expectedEmail || expectedPassword == null || expectedPassword === '') {
    return false
  }

  return (
    email.trim().toLowerCase() === expectedEmail.toLowerCase() &&
    password === expectedPassword
  )
}

/**
 * TEMPORARY client-side session marker for development Super Admin login.
 * Isolated for easy removal when backend role-based auth exists.
 */
export function markDevSuperAdminSession() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEV_SUPER_ADMIN_SESSION_KEY, '1')
  } catch {
    /* ignore storage errors */
  }
}

/** Clears the temporary development Super Admin session marker. */
export function clearDevSuperAdminSession() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEV_SUPER_ADMIN_SESSION_KEY)
  } catch {
    /* ignore storage errors */
  }
}
