'use client'

import { usePathname } from '@/i18n/navigation'

const AUTH_PREFIXES = [
  '/login',
  '/register',
  '/dashboard',
  '/forgot-password',
  '/reset-password',
]

export function ConditionalNavbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideNavbar = AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (hideNavbar) {
    return null
  }

  return <>{children}</>
}
