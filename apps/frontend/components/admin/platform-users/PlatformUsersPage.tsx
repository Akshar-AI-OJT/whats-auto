import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  MOCK_PLATFORM_USERS,
  type PlatformUserRole,
  type PlatformUserStatus,
} from '../mock-data'

const ROLE_STYLES: Record<PlatformUserRole, string> = {
  superAdmin: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  platformAdmin: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
  support: 'bg-dash-surface text-body ring-1 ring-dash-border',
  finance: 'bg-dash-warn-soft text-warning-content ring-1 ring-warning/35',
}

const STATUS_STYLES: Record<PlatformUserStatus, string> = {
  active: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  invited: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
  inactive: 'bg-dash-surface text-mute ring-1 ring-dash-border',
}

function formatCreatedDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export async function PlatformUsersPage() {
  const t = await getTranslations('admin.platformUsers')

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
            {t('subtitle')}
          </p>
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('tableTitle')}
          description={t('tableDescription', { count: MOCK_PLATFORM_USERS.length })}
        />

        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dash-border bg-dash-surface">
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                    {t('columns.name')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.email')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.role')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.status')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                    {t('columns.created')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_PLATFORM_USERS.map((user, index) => (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b border-dash-border last:border-b-0',
                      'transition-colors duration-150',
                      index % 2 === 1 && 'bg-dash-surface/60'
                    )}
                  >
                    <td className="px-4 py-3.5 sm:px-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.25)]">
                          {getInitials(user.name)}
                        </span>
                        <span className="block truncate text-sm font-semibold text-ink">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-body">{user.email}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                          ROLE_STYLES[user.role]
                        )}
                      >
                        {t(`roles.${user.role}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                          STATUS_STYLES[user.status]
                        )}
                      >
                        {t(`statuses.${user.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums text-body sm:px-5">
                      {formatCreatedDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="mt-5 flex flex-col gap-3 md:hidden">
          {MOCK_PLATFORM_USERS.map((user) => (
            <li
              key={user.id}
              className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                  {getInitials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-xs text-mute">{user.email}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                        ROLE_STYLES[user.role]
                      )}
                    >
                      {t(`roles.${user.role}`)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                        STATUS_STYLES[user.status]
                      )}
                    >
                      {t(`statuses.${user.status}`)}
                    </span>
                    <span className="text-xs text-mute">
                      {t('columns.created')}: {formatCreatedDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </DashboardPanel>
    </div>
  )
}
