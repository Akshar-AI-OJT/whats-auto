'use client'

import { DashboardChromeProvider, useDashboardChrome } from './DashboardChromeContext'
import { DashboardSidebar } from './DashboardSidebar'
import { DashboardTopbar } from './DashboardTopbar'
import { OrganizationsProvider } from './OrganizationsProvider'
import { cn } from '@/lib/utils'

type DashboardShellProps = {
  children: React.ReactNode
  className?: string
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
        <main className="flex-1 overflow-x-clip px-4 py-5 sm:px-5 sm:py-6 md:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  )
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <OrganizationsProvider>
      <DashboardChromeProvider>
        <DashboardShellFrame className={className}>{children}</DashboardShellFrame>
      </DashboardChromeProvider>
    </OrganizationsProvider>
  )
}
