'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import {
  DASHBOARD_NAV_CHILDREN,
  DASHBOARD_NAV_HREFS,
  DASHBOARD_NAV_ICONS,
  DASHBOARD_NAV_KEYS,
  type DashboardNavKey,
} from './dashboard-nav'

type DashboardSidebarNavProps = {
  onNavigate?: () => void
  className?: string
  collapsed?: boolean
}

export function DashboardSidebarNav({
  onNavigate,
  className,
  collapsed = false,
}: DashboardSidebarNavProps) {
  const t = useTranslations('dashboard.nav')
  const pathname = usePathname()
  const router = useRouter()
  const [teamOpen, setTeamOpen] = useState(
    () => pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/')
  )

  return (
    <nav aria-label={t('ariaLabel')} className={cn('flex flex-col gap-0.5', className)}>
      {DASHBOARD_NAV_KEYS.map((key) => {
        const Icon = DASHBOARD_NAV_ICONS[key]
        const href = DASHBOARD_NAV_HREFS[key]
        const children = DASHBOARD_NAV_CHILDREN[key]
        const label = t(key as DashboardNavKey)

        const active =
          key === 'dashboard'
            ? pathname === '/dashboard'
            : Boolean(href && (pathname === href || pathname.startsWith(`${href}/`)))

        const itemClass = cn(
          'group flex w-full items-center rounded-xl text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200',
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
          active
            ? 'bg-primary-pale text-positive-deep shadow-[0_0_0_1px_rgb(159_232_112/0.35)]'
            : 'text-body hover:bg-dash-surface hover:text-ink'
        )

        const iconWrap = cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-200',
          active
            ? 'bg-primary text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.35)]'
            : 'bg-dash-surface text-mute group-hover:text-positive-deep'
        )

        if (children && href) {
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <button
                type="button"
                aria-expanded={collapsed ? undefined : teamOpen}
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                className={itemClass}
                onClick={() => {
                  if (collapsed) {
                    router.push(href)
                    onNavigate?.()
                    return
                  }
                  setTeamOpen((open) => !open)
                }}
              >
                <span className={iconWrap}>
                  <Icon className="size-4" aria-hidden />
                </span>
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-mute transition-transform duration-200',
                        teamOpen && 'rotate-180'
                      )}
                      aria-hidden
                    />
                  </>
                ) : null}
              </button>

              {!collapsed && teamOpen ? (
                <div className="ml-4 flex flex-col gap-0.5 border-l border-dash-border pl-2">
                  {children.map((child) => {
                    const childLabel = t(child.key)
                    const childActive =
                      child.key === 'teamMembers' &&
                      (pathname === '/dashboard/team' ||
                        pathname.startsWith('/dashboard/team/'))

                    return (
                      <Link
                        key={child.key}
                        href={child.href ?? href}
                        onClick={onNavigate}
                        aria-current={childActive ? 'page' : undefined}
                        className={cn(
                          'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          childActive
                            ? 'bg-primary-pale/70 text-positive-deep'
                            : 'text-body hover:bg-dash-surface hover:text-ink'
                        )}
                      >
                        {childLabel}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        }

        if (href) {
          return (
            <Link
              key={key}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={itemClass}
            >
              <span className={iconWrap}>
                <Icon className="size-4" aria-hidden />
              </span>
              {!collapsed ? <span className="truncate">{label}</span> : null}
            </Link>
          )
        }

        return (
          <button
            key={key}
            type="button"
            title={collapsed ? `${label} — ${t('comingSoon')}` : t('comingSoon')}
            aria-label={collapsed ? `${label} — ${t('comingSoon')}` : undefined}
            className={cn(itemClass, 'cursor-default opacity-80')}
            onClick={(e) => e.preventDefault()}
          >
            <span className={iconWrap}>
              <Icon className="size-4" aria-hidden />
            </span>
            {!collapsed ? <span className="truncate">{label}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
