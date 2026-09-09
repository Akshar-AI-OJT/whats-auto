'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { getValidAccessToken, peekAccessTokenRole } from '@/lib/access-token'
import { AdminChromeProvider, useAdminChrome } from './AdminChromeContext'
import { AdminNavbar } from './AdminNavbar'
import { AdminSidebar } from './AdminSidebar'
import { cn } from '@/lib/utils'

type AdminShellProps = {
  children: React.ReactNode
  className?: string
}

type GateState = 'checking' | 'allowed'

function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('admin')
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let cancelled = false

    async function verify() {
      try {
        await getValidAccessToken()
        if (cancelled) return
        if (peekAccessTokenRole() !== 'superadmin') {
          router.replace('/login')
          return
        }
        setState('allowed')
      } catch {
        if (cancelled) return
        router.replace('/login')
      }
    }

    void verify()
    return () => {
      cancelled = true
    }
  }, [router])

  if (state !== 'allowed') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
        <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
        <span className="sr-only">{t('checkingAccess')}</span>
      </div>
    )
  }

  return children
}

function AdminShellFrame({ children, className }: AdminShellProps) {
  const { sidebarWidthPx, collapsed } = useAdminChrome()

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('app-shell-active')
    root.style.removeProperty('overflow')
    root.style.removeProperty('height')
    document.body.style.removeProperty('overflow')
    document.body.style.removeProperty('height')
    document.body.style.removeProperty('overscroll-behavior')
  }, [])

  return (
    <div
      className={cn('bg-dash-bg', className)}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        className="fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 ease-out lg:block"
        style={{ width: sidebarWidthPx }}
      >
        <AdminSidebar className="h-full" collapsed={collapsed} showCollapseToggle />
      </div>

      <div
        className="transition-[padding] duration-300 ease-out lg:[padding-left:var(--sidebar-w)]"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          ['--sidebar-w' as string]: `${sidebarWidthPx}px`,
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <AdminNavbar />
        </div>

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <div
            id="app-scroll-root"
            className={cn('px-3 pt-4', 'sm:px-4 sm:pt-5 lg:px-5 lg:pt-6')}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              overflowX: 'hidden',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              paddingBottom: 'max(5rem, calc(1.5rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminShell({ children, className }: AdminShellProps) {
  return (
    <AdminAuthGate>
      <AdminChromeProvider>
        <AdminShellFrame className={className}>{children}</AdminShellFrame>
      </AdminChromeProvider>
    </AdminAuthGate>
  )
}
