'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import {
  ADMIN_NAV_HREFS,
  ADMIN_NAV_ICONS,
  ADMIN_NAV_SECTIONS,
  type AdminNavKey,
} from './admin-nav'

type AdminSidebarNavProps = {
  onNavigate?: () => void
  className?: string
  collapsed?: boolean
}

export function AdminSidebarNav({
  onNavigate,
  className,
  collapsed = false,
}: AdminSidebarNavProps) {
  const t = useTranslations('admin.nav')
  const pathname = usePathname()

  return (
    <nav aria-label={t('ariaLabel')} className={cn('flex flex-col gap-4', className)}>
      {ADMIN_NAV_SECTIONS.map((section) => (
        <div key={section.id} className="flex flex-col gap-0.5">
          {!collapsed ? (
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-mute uppercase">
              {t(`sections.${section.id}`)}
            </p>
          ) : (
            <div className="mx-auto mb-0.5 h-px w-6 bg-dash-border" aria-hidden />
          )}

          {section.items.map((key) => {
            const Icon = ADMIN_NAV_ICONS[key]
            const href = ADMIN_NAV_HREFS[key]
            const active = Boolean(
              href && (pathname === href || pathname.startsWith(`${href}/`))
            )
            const label = t(key as AdminNavKey)

            const itemClass = cn(
              'group flex w-full cursor-pointer items-center rounded-xl text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
              active
                ? 'bg-primary-pale text-positive-deep shadow-[0_0_0_1px_rgb(37_99_235/0.35)]'
                : 'text-body hover:bg-dash-surface hover:text-ink'
            )

            const iconWrap = cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-200',
              active
                ? 'bg-primary text-on-primary shadow-[0_4px_12px_rgb(37_99_235/0.35)]'
                : 'bg-dash-surface text-mute group-hover:text-positive-deep'
            )

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
        </div>
      ))}
    </nav>
  )
}
