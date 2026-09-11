'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { getValidAccessToken, peekAccessTokenRole } from '@/lib/access-token'
import { authClient } from '@/lib/auth-client'
import { ORG_SETUP_PATH } from '@/lib/onboarding'
import { SUPER_ADMIN_HOME_PATH } from '@/lib/post-auth-redirect'
import { DashboardChromeProvider, useDashboardChrome } from './DashboardChromeContext'
import { DashboardSidebar } from './DashboardSidebar'
import { DashboardTopbar } from './DashboardTopbar'
import { OrganizationsProvider, useOrganizations } from './OrganizationsProvider'
import { ProductAccessRouteGate } from './ProductAccessRouteGate'
import { cn } from '@/lib/utils'

type DashboardShellProps = {
  children: React.ReactNode
  className?: string
}

function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('dashboard.accessDenied')
  // Better Auth defaults refetchOnWindowFocus=true → isRefetching on tab return.
  // Never treat refetch as a cold start: that unmounts OrganizationsProvider + shell.
  const { data: sessionData, isPending } = authClient.useSession()
  const isSignedIn = Boolean(sessionData?.user)

  useEffect(() => {
    if (!isPending && !isSignedIn) {
      router.replace('/login')
    }
  }, [isPending, isSignedIn, router])

  // Full-screen only when there is no authenticated session yet (initial pending
  // or redirecting to login). Background session refetches keep children mounted.
  if (!isSignedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
        <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  return children
}

/**
 * Belt-and-suspenders: signed-in users with zero live memberships must not
 * remain on `/dashboard` (Google/deep-link bypass of post-auth routing).
 */
function DashboardMembershipGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const t = useTranslations('dashboard.accessDenied')
  // Wait for membership list only — not org bootstrap / JWT remint (those keep
  // tenantOrganizationId null so overview uses skeletons, not full-screen spin).
  const { hasOrganizations, isMembershipLoading } = useOrganizations()
  const [platformChecked, setPlatformChecked] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await getValidAccessToken()
        if (!cancelled) setIsSuperAdmin(peekAccessTokenRole() === 'superadmin')
      } catch {
        if (!cancelled) setIsSuperAdmin(false)
      } finally {
        if (!cancelled) setPlatformChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isMembershipLoading || !platformChecked) return
    if (hasOrganizations) return
    router.replace(isSuperAdmin ? SUPER_ADMIN_HOME_PATH : ORG_SETUP_PATH)
  }, [hasOrganizations, isMembershipLoading, isSuperAdmin, platformChecked, router])

  // Org membership list still resolving — keep the gate spinner.
  if (isMembershipLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
        <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  // Happy path: memberships known — do not block the shell on JWT remint /
  // superadmin probe (that check only decides where zero-org users go).
  if (hasOrganizations) {
    return children
  }

  // Zero orgs: wait for platform role before redirecting.
  if (!platformChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
        <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
      <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
      <span className="sr-only">{t('loading')}</span>
    </div>
  )
}

function DashboardShellFrame({ children, className }: DashboardShellProps) {
  const { sidebarWidthPx, collapsed } = useDashboardChrome()

  // Clear any leftover locks from earlier experiments. Do NOT set
  // body/html overflow:hidden — that blocks touch scrolling into nested
  // overflow containers on iOS / Chrome device mode.
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
    // Fixed to the visual viewport. Scroll happens on #app-scroll-root only
    // (absolute fill) — avoids flex/grid min-size traps that clip module bottoms.
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
        <DashboardSidebar className="h-full" collapsed={collapsed} showCollapseToggle />
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
        {/* Above #app-scroll-root so topbar dropdowns (profile/org/search) are not covered */}
        <div className="relative z-40 shrink-0">
          <DashboardTopbar />
        </div>

        <div className="relative z-0 min-h-0 flex-1">
          <div
            id="app-scroll-root"
            className={cn(
              'px-4 pt-5',
              'sm:px-5 sm:pt-6 md:px-6 lg:px-8 lg:pt-7'
            )}
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
              // Extra bottom space so the last list row (phone/actions) clears the fold.
              paddingBottom: 'max(6rem, calc(2rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            <ProductAccessRouteGate>{children}</ProductAccessRouteGate>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <DashboardAuthGate>
      <OrganizationsProvider>
        <DashboardMembershipGate>
          <DashboardChromeProvider>
            <DashboardShellFrame className={className}>{children}</DashboardShellFrame>
          </DashboardChromeProvider>
        </DashboardMembershipGate>
      </OrganizationsProvider>
    </DashboardAuthGate>
  )
}
