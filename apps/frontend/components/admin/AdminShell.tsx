'use client'

import { AdminChromeProvider, useAdminChrome } from './AdminChromeContext'
import { AdminNavbar } from './AdminNavbar'
import { AdminSidebar } from './AdminSidebar'
import { cn } from '@/lib/utils'

type AdminShellProps = {
  children: React.ReactNode
  className?: string
}

function AdminShellFrame({ children, className }: AdminShellProps) {
  const { sidebarWidthPx, collapsed } = useAdminChrome()

  return (
    <div className={cn('app-shell flex min-h-dvh bg-dash-bg', className)}>
      <div
        className="fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 ease-out lg:block"
        style={{ width: sidebarWidthPx }}
      >
        <AdminSidebar className="h-full" collapsed={collapsed} showCollapseToggle />
      </div>

      <div
        className="flex min-h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-out lg:[padding-left:var(--sidebar-w)]"
        style={{ ['--sidebar-w' as string]: `${sidebarWidthPx}px` }}
      >
        <AdminNavbar />
        <main className="flex-1 overflow-x-clip px-4 py-5 sm:px-5 sm:py-6 md:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  )
}

export function AdminShell({ children, className }: AdminShellProps) {
  return (
    <AdminChromeProvider>
      <AdminShellFrame className={className}>{children}</AdminShellFrame>
    </AdminChromeProvider>
  )
}
