'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppLogo } from '@/components/branding/AppLogo'
import { cn } from '@/lib/utils'
import { useDashboardChrome } from './DashboardChromeContext'
import { DashboardSidebarNav } from './DashboardSidebarNav'

type DashboardSidebarProps = {
  className?: string
  onNavigate?: () => void
  /** When omitted (mobile sheet), always show expanded labels. */
  collapsed?: boolean
  showCollapseToggle?: boolean
}

export function DashboardSidebar({
  className,
  onNavigate,
  collapsed = false,
  showCollapseToggle = false,
}: DashboardSidebarProps) {
  const t = useTranslations('dashboard')
  const { toggleCollapsed } = useDashboardChrome()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-dash-border bg-canvas/95 backdrop-blur-md',
        className
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-dash-border',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
        )}
      >
        <AppLogo variant="mark" size="sm" className="rounded-xl" />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-ink">{t('brand')}</p>
            <p className="truncate text-[11px] font-medium text-mute">{t('brandTagline')}</p>
          </div>
        ) : null}
        {showCollapseToggle && !collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t('sidebar.collapse')}
            title={t('sidebar.collapse')}
            className={cn(
              'hidden size-8 shrink-0 items-center justify-center rounded-lg text-mute lg:inline-flex',
              'transition-[background-color,color] duration-200 hover:bg-dash-surface hover:text-ink'
            )}
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {showCollapseToggle && collapsed ? (
        <div className="hidden justify-center px-2 pt-3 lg:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t('sidebar.expand')}
            title={t('sidebar.expand')}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-xl border border-dash-border text-mute',
              'transition-[background-color,color,border-color] duration-200 hover:bg-dash-surface hover:text-ink'
            )}
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        <DashboardSidebarNav onNavigate={onNavigate} collapsed={collapsed} />
      </div>

      {!collapsed ? (
        <div className="shrink-0 border-t border-dash-border p-3">
          <div
            className={cn(
              'rounded-2xl border border-dash-border bg-dash-surface/90 px-3 py-3',
              'dash-soft-shadow'
            )}
          >
            <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">
              {t('sidebar.planLabel')}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{t('sidebar.planName')}</p>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
