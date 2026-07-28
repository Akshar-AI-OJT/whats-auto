'use client'

import { useCallback, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { useRouter } from '@/i18n/navigation'
import {
  MOCK_ORGANIZATIONS,
  type MockOrganization,
  type OrganizationPlan,
  type OrganizationStatus,
} from '../mock-data'
import {
  OrganizationActionsMenu,
  OrganizationPlanBadge,
  OrganizationStatusBadge,
  type OrganizationActionId,
} from './OrganizationActionsMenu'

type StatusFilter = 'all' | OrganizationStatus
type PlanFilter = 'all' | OrganizationPlan

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

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

export function OrganizationsPage() {
  const t = useTranslations('admin.organizations')
  const router = useRouter()
  const [organizations, setOrganizations] = useState(() => [...MOCK_ORGANIZATIONS])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return organizations.filter((org) => {
      if (statusFilter !== 'all' && org.status !== statusFilter) return false
      if (planFilter !== 'all' && org.plan !== planFilter) return false
      if (!query) return true

      return (
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query) ||
        org.ownerName.toLowerCase().includes(query) ||
        org.ownerEmail.toLowerCase().includes(query)
      )
    })
  }, [organizations, search, statusFilter, planFilter])

  const rows = useMemo(
    () =>
      filtered.map((org) => ({
        ...org,
        initials: getInitials(org.name),
        createdLabel: formatCreatedDate(org.createdAt),
        planLabel: t(`filters.plan.${org.plan}`),
        statusLabel: t(`filters.status.${org.status}`),
      })),
    [filtered, t]
  )

  const handleAction = useCallback(
    (action: OrganizationActionId, organization: MockOrganization) => {
      if (action === 'view') {
        router.push(`/admin/organizations/${organization.id}`)
        return
      }

      if (action === 'suspend') {
        setOrganizations((prev) => {
          let changed = false
          const next = prev.map((org) => {
            if (org.id !== organization.id) return org
            if (org.status === 'suspended') return org
            changed = true
            return { ...org, status: 'suspended' as const }
          })
          return changed ? next : prev
        })
        return
      }

      if (action === 'activate') {
        setOrganizations((prev) => {
          let changed = false
          const next = prev.map((org) => {
            if (org.id !== organization.id) return org
            const targetStatus: OrganizationStatus =
              org.plan === 'starter' ? 'trial' : 'active'
            if (org.status === targetStatus) return org
            changed = true
            return { ...org, status: targetStatus }
          })
          return changed ? next : prev
        })
        return
      }

      if (action === 'delete') {
        setOrganizations((prev) => {
          const hasMatch = prev.some((org) => org.id === organization.id)
          if (!hasMatch) return prev
          return prev.filter((org) => org.id !== organization.id)
        })
      }
    },
    [router]
  )

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
          description={t('tableDescription', { count: filtered.length })}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
            <label htmlFor="org-search" className="sr-only">
              {t('searchLabel')}
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id="org-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-11 rounded-xl border-dash-border bg-dash-surface/90 pl-10 text-sm shadow-none"
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="org-status-filter" className="sr-only">
              {t('statusFilterLabel')}
            </label>
            <select
              id="org-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.status.all')}</option>
              <option value="active">{t('filters.status.active')}</option>
              <option value="trial">{t('filters.status.trial')}</option>
              <option value="suspended">{t('filters.status.suspended')}</option>
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="org-plan-filter" className="sr-only">
              {t('planFilterLabel')}
            </label>
            <select
              id="org-plan-filter"
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value as PlanFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.plan.all')}</option>
              <option value="starter">{t('filters.plan.starter')}</option>
              <option value="growth">{t('filters.plan.growth')}</option>
              <option value="pro">{t('filters.plan.pro')}</option>
              <option value="enterprise">{t('filters.plan.enterprise')}</option>
            </select>
          </div>
        </div>

        {/* Desktop / tablet table */}
        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dash-border bg-dash-surface">
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                    {t('columns.organization')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.owner')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.plan')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.status')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.members')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.created')}
                  </th>
                  <th className="px-4 py-3.5 text-right text-sm font-semibold text-ink sm:px-5">
                    {t('columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-mute"
                    >
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((org, index) => (
                    <tr
                      key={org.id}
                      className={cn(
                        'border-b border-dash-border last:border-b-0',
                        'transition-colors duration-150',
                        index % 2 === 1 && 'bg-dash-surface/60'
                      )}
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.25)]">
                            {org.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {org.name}
                            </span>
                            <span className="block truncate text-xs text-mute">
                              {org.slug}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block truncate text-sm font-medium text-ink">
                          {org.ownerName}
                        </span>
                        <span className="block truncate text-xs text-mute">
                          {org.ownerEmail}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <OrganizationPlanBadge label={org.planLabel} />
                      </td>
                      <td className="px-4 py-3.5">
                        <OrganizationStatusBadge
                          status={org.status}
                          label={org.statusLabel}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-sm tabular-nums text-ink">
                        {org.members}
                      </td>
                      <td className="px-4 py-3.5 text-sm tabular-nums text-body">
                        {org.createdLabel}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <OrganizationActionsMenu
                          organization={org}
                          onAction={handleAction}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile stacked cards */}
        <ul className="mt-5 flex flex-col gap-3 md:hidden">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-dash-border bg-dash-surface/60 px-4 py-10 text-center text-sm text-mute">
              {t('empty')}
            </li>
          ) : (
            rows.map((org) => (
              <li key={org.id}>
                <article
                  className={cn(
                    'rounded-2xl border border-dash-border bg-dash-surface/60 p-4',
                    'transition-colors duration-150'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                        {org.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{org.name}</p>
                        <p className="truncate text-xs text-mute">{org.slug}</p>
                      </div>
                    </div>
                    <OrganizationActionsMenu
                      organization={org}
                      onAction={handleAction}
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-mute">{t('columns.owner')}</dt>
                      <dd className="mt-0.5 truncate font-medium text-ink">{org.ownerName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-mute">{t('columns.members')}</dt>
                      <dd className="mt-0.5 tabular-nums font-medium text-ink">{org.members}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-mute">{t('columns.plan')}</dt>
                      <dd className="mt-1">
                        <OrganizationPlanBadge label={org.planLabel} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-mute">{t('columns.status')}</dt>
                      <dd className="mt-1">
                        <OrganizationStatusBadge
                          status={org.status}
                          label={org.statusLabel}
                        />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-mute">{t('columns.created')}</dt>
                      <dd className="mt-0.5 text-body">{org.createdLabel}</dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))
          )}
        </ul>
      </DashboardPanel>
    </div>
  )
}
