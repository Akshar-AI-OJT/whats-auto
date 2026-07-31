'use client'

import { usePathname } from '@/i18n/navigation'

const HIDE_PREFIXES = [
  '/login',
  '/register',
  '/dashboard',
  '/admin',
  '/onboarding',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
]

export function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hide = HIDE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (hide) return null
  return <>{children}</>
}
