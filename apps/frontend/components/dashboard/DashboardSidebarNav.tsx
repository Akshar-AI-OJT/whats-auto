'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/lib/rbac'
import {
  DASHBOARD_NAV_CHILDREN,
  DASHBOARD_NAV_HREFS,
  DASHBOARD_NAV_ICONS,
  DASHBOARD_NAV_PERMISSION,
  DASHBOARD_NAV_SECTIONS,
  isCustomerGroupsPath,
  isMediaLibraryPath,
  isTemplatesListPath,
  type DashboardNavKey,
} from './dashboard-nav'

type DashboardSidebarNavProps = {
  onNavigate?: () => void
  className?: string
  collapsed?: boolean
}

function initialOpenState(pathname: string): Partial<Record<DashboardNavKey, boolean>> {
  return {
    team: pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/'),
    contacts:
      pathname === '/dashboard/contacts' ||
      pathname.startsWith('/dashboard/contacts/') ||
      isCustomerGroupsPath(pathname),
  }
}

export function DashboardSidebarNav({
  onNavigate,
  className,
  collapsed = false,
}: DashboardSidebarNavProps) {
  const t = useTranslations('dashboard.nav')
  const pathname = usePathname()
  const router = useRouter()
  const { hasPermission, hasAnyPermission, isLoading: permissionsLoading } = usePermissions()
  const routeOpen = initialOpenState(pathname)
  const routeOpenKey = `${Boolean(routeOpen.team)}:${Boolean(routeOpen.contacts)}`
  const [openByKey, setOpenByKey] = useState(() => routeOpen)
  const [appliedRouteOpenKey, setAppliedRouteOpenKey] = useState(routeOpenKey)
  if (routeOpenKey !== appliedRouteOpenKey) {
    setAppliedRouteOpenKey(routeOpenKey)
    setOpenByKey((prev) => ({
      ...prev,
      ...(routeOpen.team ? { team: true } : {}),
      ...(routeOpen.contacts ? { contacts: true } : {}),
    }))
  }

  function isItemVisible(key: DashboardNavKey) {
    if (key === 'team') {
      const canMembers = hasPermission(PERMISSIONS.TEAM_VIEW)
      const canRoles =
        hasPermission(PERMISSIONS.ROLES_VIEW) || hasPermission(PERMISSIONS.TEAM_VIEW)
      return permissionsLoading || canMembers || canRoles
    }
    if (key === 'templates') {
      return (
        permissionsLoading ||
        hasAnyPermission([PERMISSIONS.TEMPLATES_VIEW, PERMISSIONS.WHATSAPP_VIEW])
      )
    }
    if (key === 'media') {
      return permissionsLoading || hasPermission(PERMISSIONS.MEDIA_VIEW)
    }
    const navPermission = DASHBOARD_NAV_PERMISSION[key]
    if (navPermission && !permissionsLoading && !hasPermission(navPermission)) {
      return false
    }
    return true
  }

  function renderItem(key: DashboardNavKey) {
    if (!isItemVisible(key)) return null

    const children = DASHBOARD_NAV_CHILDREN[key]
    const href = DASHBOARD_NAV_HREFS[key]
    const Icon = DASHBOARD_NAV_ICONS[key]
    const label = t(key)

    const active =
      key === 'dashboard'
        ? pathname === '/dashboard'
        : key === 'contacts'
          ? pathname === '/dashboard/contacts' ||
            pathname.startsWith('/dashboard/contacts/') ||
            isCustomerGroupsPath(pathname)
          : key === 'templates'
            ? isTemplatesListPath(pathname)
            : key === 'media'
              ? isMediaLibraryPath(pathname)
              : Boolean(href && (pathname === href || pathname.startsWith(`${href}/`)))

    const itemClass = cn(
      'group flex w-full cursor-pointer items-center rounded-xl text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200',
      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
      active
        ? 'bg-primary-pale text-positive-deep shadow-[0_0_0_1px_rgb(159_232_112/0.35)]'
        : 'text-body hover:bg-dash-surface hover:text-ink'
    )

    const iconWrap = cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-200',
      active
        ? 'bg-primary text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.4)]'
        : 'bg-dash-surface text-mute group-hover:text-positive-deep'
    )

    if (children && href) {
      const visibleChildren = children.filter((child) => {
        if (permissionsLoading) return true
        if (child.key === 'teamMembers') return hasPermission(PERMISSIONS.TEAM_VIEW)
        if (child.key === 'teamRoles') {
          return hasAnyPermission([PERMISSIONS.ROLES_VIEW, PERMISSIONS.TEAM_VIEW])
        }
        return hasPermission(child.permission)
      })

      if (visibleChildren.length === 0) return null

      const primaryHref = visibleChildren[0]?.href ?? href
      const sectionOpen = Boolean(openByKey[key])

      return (
        <div key={key} className="flex flex-col gap-0.5">
          <button
            type="button"
            aria-expanded={collapsed ? undefined : sectionOpen}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={itemClass}
            onClick={() => {
              if (collapsed) {
                router.push(primaryHref)
                onNavigate?.()
                return
              }
              setOpenByKey((prev) => ({ ...prev, [key]: !prev[key] }))
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
                    sectionOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
              </>
            ) : null}
          </button>

          {!collapsed && sectionOpen ? (
            <div className="ml-4 flex flex-col gap-0.5 border-l border-dash-border pl-2">
              {visibleChildren.map((child) => {
                const childLabel = t(child.key)
                const childHref = child.href ?? href
                const childActive =
                  child.key === 'teamMembers' || child.key === 'contactsList'
                    ? pathname === childHref
                    : pathname === childHref || pathname.startsWith(`${childHref}/`)

                return (
                  <Link
                    key={child.key}
                    href={childHref}
                    onClick={onNavigate}
                    aria-current={childActive ? 'page' : undefined}
                    className={cn(
                      'cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
  }

  return (
    <nav aria-label={t('ariaLabel')} className={cn('flex flex-col gap-4', className)}>
      {DASHBOARD_NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((key) => isItemVisible(key))
        if (visibleItems.length === 0) return null

        return (
          <div key={section.id} className="flex flex-col gap-0.5">
            {!collapsed ? (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-mute uppercase">
                {t(`sections.${section.id}`)}
              </p>
            ) : (
              <div className="mx-auto mb-0.5 h-px w-6 bg-dash-border" aria-hidden />
            )}
            {visibleItems.map((key) => renderItem(key))}
          </div>
        )
      })}
    </nav>
  )
}
