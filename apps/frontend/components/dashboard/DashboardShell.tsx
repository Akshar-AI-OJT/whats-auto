'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { peekAccessTokenRole } from '@/lib/access-token'
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
  const { data: sessionData, isPending, isRefetching } = authClient.useSession()
  const isSignedIn = Boolean(sessionData?.user)

  useEffect(() => {
    // Wait out in-flight session refetches (e.g. right after org create) before
    // treating a missing user as signed-out.
    if (!isPending && !isRefetching && !isSignedIn) {
      router.replace('/login')
    }
  }, [isPending, isRefetching, isSignedIn, router])

  if (isPending || isRefetching || !isSignedIn) {
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
  const { hasOrganizations, isLoading } = useOrganizations()
  const isSuperAdmin = peekAccessTokenRole() === 'superadmin'

  useEffect(() => {
    if (isLoading) return
    if (hasOrganizations) return
    router.replace(isSuperAdmin ? SUPER_ADMIN_HOME_PATH : ORG_SETUP_PATH)
  }, [hasOrganizations, isLoading, isSuperAdmin, router])

  if (isLoading || !hasOrganizations) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dash-bg">
        <Loader2 className="size-6 animate-spin text-mute" aria-hidden />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  return children
}

function DashboardShellFrame({ children, className }: DashboardShellProps) {
  const { sidebarWidthPx, collapsed } = useDashboardChrome()

  return (
    <div className={cn('app-shell flex min-h-dvh bg-dash-bg', className)}>
      <div
        className="fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 ease-out lg:block"
        style={{ width: sidebarWidthPx }}
      >
        <DashboardSidebar className="h-full" collapsed={collapsed} showCollapseToggle />
      </div>

      <div
        className="flex min-h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-out lg:[padding-left:var(--sidebar-w)]"
        style={{ ['--sidebar-w' as string]: `${sidebarWidthPx}px` }}
      >
        <DashboardTopbar />
        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 sm:px-5 sm:py-6 md:px-6 lg:px-8 lg:py-7">
          <ProductAccessRouteGate>{children}</ProductAccessRouteGate>
        </main>
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
