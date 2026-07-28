'use client'

import { useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { clearDevSuperAdminSession } from '@/lib/dev-super-admin-auth'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { AdminSidebar } from './AdminSidebar'

type AdminNavbarProps = {
  className?: string
}

export function AdminNavbar({ className }: AdminNavbarProps) {
  const t = useTranslations('admin')
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleLogout() {
    // TEMPORARY: clear dev-only marker before redirecting to tenant login.
    clearDevSuperAdminSession()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-dash-border bg-canvas/90 px-3 backdrop-blur-md sm:gap-4 sm:px-5',
        'dash-soft-shadow',
        className
      )}
    >
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-dash-border bg-canvas text-ink lg:hidden',
            'transition-[background-color,border-color] duration-200 hover:bg-dash-surface'
          )}
          aria-label={t('navbar.openMenu')}
        >
          <Menu className="size-5" aria-hidden />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton
          className="w-[min(280px,85vw)] border-dash-border bg-canvas p-0 sm:max-w-[280px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('brand')}</SheetTitle>
          </SheetHeader>
          <AdminSidebar
            className="h-full border-0"
            collapsed={false}
            showCollapseToggle={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink sm:text-base">
          {t('navbar.title')}
        </p>
        <p className="hidden truncate text-xs text-mute sm:block">{t('navbar.subtitle')}</p>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className={cn(
          'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-dash-border px-3 text-sm font-medium text-body',
          'transition-[background-color,border-color,color] duration-200 hover:bg-dash-surface hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
        )}
        aria-label={t('navbar.logout')}
        title={t('navbar.logout')}
      >
        <LogOut className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('navbar.logout')}</span>
      </button>
      <ThemeToggle />
    </header>
  )
}
