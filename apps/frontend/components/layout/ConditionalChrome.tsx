'use client'

import { usePathname } from '@/i18n/navigation'

const HIDE_PREFIXES = [
  '/login',
  '/register',
  '/dashboard',
  '/forgot-password',
  '/reset-password',
]

export function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hide = HIDE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (hide) return null
  return <>{children}</>
}
