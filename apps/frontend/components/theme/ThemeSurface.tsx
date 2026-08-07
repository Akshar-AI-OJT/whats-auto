'use client'

import { usePathname } from 'next/navigation'
import { pathAllowsDarkTheme } from '@/components/theme/theme-scope'

/**
 * Locks semantic color tokens to light on every public route.
 * Dashboard / admin render children as-is so html.dark can theme the app shell.
 */
export function ThemeSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'

  if (pathAllowsDarkTheme(pathname)) {
    return <>{children}</>
  }

  return <div className="light-locked flex min-h-dvh flex-col">{children}</div>
}
