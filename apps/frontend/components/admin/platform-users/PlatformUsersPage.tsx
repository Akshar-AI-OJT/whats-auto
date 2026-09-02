'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw, Search, Users } from 'lucide-react'
import type { SuperAdminPlatformUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  listSuperAdminPlatformUsers,
  mapPlatformUsersApiError,
} from './platform-users-api'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 350

type StatusFilter = 'all' | 'active' | 'inactive'

const selectClassName = cn(
  'h-10 w-full cursor-pointer rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

const STATUS_STYLES: Record<'active' | 'inactive', string> = {
  active: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  inactive: 'bg-dash-surface text-mute ring-1 ring-dash-border',
}

function formatCreatedDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
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

function platformRoleLabel(
  user: SuperAdminPlatformUser,
  t: (key: string) => string
) {
  if (user.platformRole === 'superadmin') return t('roles.superadmin')
  const organizations = user.organizations ?? []
  const orgRoles = [
    ...new Set(organizations.map((org) => org.role).filter(Boolean)),
  ]
  if (orgRoles.length === 0) return t('roles.user')
  return orgRoles
    .map((role) => role.charAt(0).toUpperCase() + role.slice(1))
    .join(', ')
}

function organizationsLabel(
  user: SuperAdminPlatformUser,
  empty: string,
  moreLabel: (count: number) => string
) {
  const organizations = user.organizations ?? []
  if (organizations.length === 0) return empty
  const names = organizations.map((org) => org.organizationName).filter(Boolean)
  if (names.length === 0) return empty
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} ${moreLabel(names.length - 2)}`
}

function StatusBadge({ status, label }: { status: 'active' | 'inactive'; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status]
      )}
    >
      {label}
    </span>
  )
}

export function PlatformUsersPage() {
  const t = useTranslations('admin.platformUsers')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const usersQuery = useQuery({
    queryKey: ['admin-platform-users', page, search, status],
    queryFn: async () =>
      listSuperAdminPlatformUsers({
        page,
        perPage: PER_PAGE,
        search: search || undefined,
        status,
      }),
  })

  const items = usersQuery.data?.items ?? []
  const meta = usersQuery.data?.meta
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1
  const hasFilters = Boolean(search || status !== 'all')

  const errorMessage = useMemo(() => {
    if (!usersQuery.isError) return null
    return mapPlatformUsersApiError(usersQuery.error, t('errors.loadFailed'))
  }, [t, usersQuery.error, usersQuery.isError])

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
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
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={usersQuery.isFetching}
            onClick={() => void usersQuery.refetch()}
          >
            <RefreshCw
              className={cn('size-4', usersQuery.isFetching && 'animate-spin')}
              aria-hidden
            />
            {t('refresh')}
          </Button>
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('tableTitle')}
          description={
            usersQuery.isSuccess
              ? t('tableDescription', { count: total })
              : t('tableDescriptionLoading')
          }
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative min-w-0">
            <label htmlFor="platform-users-search" className="sr-only">
              {t('filters.search')}
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id="platform-users-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-10 rounded-xl border-dash-border bg-canvas pl-10 text-sm shadow-none"
            />
          </div>

          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-body">
            <span className="sr-only">{t('filters.status')}</span>
            <select
              className={selectClassName}
              value={status}
              aria-label={t('filters.status')}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter)
                setPage(1)
              }}
            >
              <option value="all">{t('filters.allStatuses')}</option>
              <option value="active">{t('statuses.active')}</option>
              <option value="inactive">{t('statuses.inactive')}</option>
            </select>
          </label>
        </div>

        {usersQuery.isLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : errorMessage ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-16 text-center">
            <p role="alert" className="text-sm text-negative">
              {errorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void usersQuery.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <Users className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                {hasFilters ? t('emptyFilteredTitle') : t('emptyTitle')}
              </p>
              <p className="mt-1 text-sm text-mute">
                {hasFilters ? t('emptyFilteredDescription') : t('emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
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
                        {t('columns.organizations')}
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
                    {items.map((user, index) => (
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
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary shadow-[0_4px_12px_rgb(37_99_235/0.25)]">
                              {getInitials(user.name || user.email)}
                            </span>
                            <span className="block truncate text-sm font-semibold text-ink">
                              {user.name || t('emptyValue')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-body">{user.email}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cn(
                              'inline-flex max-w-[14rem] truncate rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                              user.platformRole === 'superadmin'
                                ? 'bg-primary-pale text-positive-deep ring-1 ring-primary/30'
                                : 'bg-dash-surface text-body ring-1 ring-dash-border'
                            )}
                          >
                            {platformRoleLabel(user, t)}
                          </span>
                        </td>
                        <td className="max-w-[16rem] truncate px-4 py-3.5 text-sm text-body">
                          {organizationsLabel(
                            user,
                            t('emptyValue'),
                            (count) => t('moreOrganizations', { count })
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            status={user.status}
                            label={t(`statuses.${user.status}`)}
                          />
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
              {items.map((user) => (
                <li
                  key={user.id}
                  className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                      {getInitials(user.name || user.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {user.name || t('emptyValue')}
                      </p>
                      <p className="truncate text-xs text-mute">{user.email}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                            user.platformRole === 'superadmin'
                              ? 'bg-primary-pale text-positive-deep ring-1 ring-primary/30'
                              : 'bg-dash-surface text-body ring-1 ring-dash-border'
                          )}
                        >
                          {platformRoleLabel(user, t)}
                        </span>
                        <StatusBadge
                          status={user.status}
                          label={t(`statuses.${user.status}`)}
                        />
                        <span className="text-xs text-mute">
                          {t('columns.created')}: {formatCreatedDate(user.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-body">
                        {t('columns.organizations')}:{' '}
                        {organizationsLabel(
                          user,
                          t('emptyValue'),
                          (count) => t('moreOrganizations', { count })
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {lastPage > 1 ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-mute">
                  {t('pagination.pageOf', { page, lastPage, total })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || usersQuery.isFetching}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    {t('pagination.previous')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage || usersQuery.isFetching}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t('pagination.next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>
    </div>
  )
}
