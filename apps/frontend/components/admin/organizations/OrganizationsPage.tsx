'use client'

import { useCallback, useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  PauseCircle,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { useRouter } from '@/i18n/navigation'
import type { SuperAdminPlan, SuperAdminSubscription } from '@/lib/api'
import {
  deleteSuperAdminOrganization,
  listAllSuperAdminOrganizations,
  mapOrgApiError,
  updateSuperAdminOrganization,
  type AdminOrganizationListItem,
  type AdminOrganizationUiStatus,
} from './organization-api'
import {
  listAllSuperAdminSubscriptions,
  listSuperAdminPlansCatalog,
  planLabel,
} from '@/components/admin/subscriptions/subscription-api'
import {
  OrganizationActionsMenu,
  OrganizationPlanBadge,
  OrganizationStatusBadge,
  type OrganizationActionId,
} from './OrganizationActionsMenu'
import { OrganizationDetailDrawer, type OrganizationRow } from './OrganizationDetailDrawer'

type StatusFilter = 'all' | AdminOrganizationUiStatus
/** Filter by live plan UUID (`all` = any / no subscription). */
type PlanFilter = 'all' | string

const PER_PAGE = 20
const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

function formatCreatedDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
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

function eventTime(value: string): number | null {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

function pickSubscription(
  subscriptions: SuperAdminSubscription[],
  organizationId: string
): SuperAdminSubscription | null {
  const matches = subscriptions.filter((row) => row.organizationId === organizationId)
  if (matches.length === 0) return null
  const rank = (status: string) => (status === 'active' ? 0 : status === 'trialing' ? 1 : 2)
  return [...matches].sort((a, b) => rank(String(a.status)) - rank(String(b.status)))[0]
}

function toRow(
  org: AdminOrganizationListItem,
  subscriptions: SuperAdminSubscription[],
  plans: SuperAdminPlan[],
  unavailable: string
): OrganizationRow {
  const subscription = pickSubscription(subscriptions, org.id)
  return {
    ...org,
    subscription,
    planKey: subscription?.planId ?? null,
    planLabel: subscription ? planLabel(subscription.planId, plans) : unavailable,
  }
}

type EditFormState = {
  name: string
  phone: string
  website: string
  industry: string
  timezone: string
  currency: string
}

function editFormFromOrg(org: AdminOrganizationListItem): EditFormState {
  return {
    name: org.name ?? '',
    phone: org.phone ?? '',
    website: org.website ?? '',
    industry: org.industry ?? '',
    timezone: org.timezone ?? '',
    currency: org.currency ?? '',
  }
}

export function OrganizationsPage() {
  const t = useTranslations('admin.organizations')
  const router = useRouter()
  const queryClient = useQueryClient()
  const deleteTitleId = useId()
  const deleteDescId = useId()
  const editTitleId = useId()
  const statusTitleId = useId()

  const orgsQueryKey = queryKeys.admin.organizations()
  const orgsQuery = useQuery({
    queryKey: orgsQueryKey,
    queryFn: async () => {
      const [orgs, subs] = await Promise.all([
        listAllSuperAdminOrganizations(),
        listAllSuperAdminSubscriptions().catch(() => [] as SuperAdminSubscription[]),
      ])
      return { organizations: orgs, subscriptions: subs }
    },
    staleTime: 60_000,
  })

  const plansQuery = useQuery({
    queryKey: queryKeys.admin.plans({ status: 'all', scope: 'organization-catalog' }),
    queryFn: () => listSuperAdminPlansCatalog('all'),
    staleTime: 60_000,
  })

  const organizations = useMemo(() => orgsQuery.data?.organizations ?? [], [orgsQuery.data])
  const subscriptions = useMemo(() => orgsQuery.data?.subscriptions ?? [], [orgsQuery.data])
  const plans = useMemo((): SuperAdminPlan[] => plansQuery.data ?? [], [plansQuery.data])
  const planFilterOptions = useMemo(() => {
    const byId = new Map<string, SuperAdminPlan>()
    for (const plan of plans) {
      if (plan.status === 'archived') continue
      byId.set(plan.id, plan)
    }
    for (const sub of subscriptions) {
      const match = plans.find((plan) => plan.id === sub.planId)
      if (match) byId.set(match.id, match)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [plans, subscriptions])
  const listLoading = orgsQuery.isLoading || plansQuery.isLoading
  const listError = orgsQuery.error ? mapOrgApiError(orgsQuery.error, t('errors.loadFailed')) : null

  function patchOrganizations(
    updater: (prev: AdminOrganizationListItem[]) => AdminOrganizationListItem[]
  ) {
    queryClient.setQueryData<typeof orgsQuery.data>(orgsQueryKey, (old) => {
      if (!old) return old
      return { ...old, organizations: updater(old.organizations) }
    })
  }

  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [page, setPage] = useState(1)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminOrganizationListItem | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [statusTarget, setStatusTarget] = useState<AdminOrganizationListItem | null>(null)

  const [editTarget, setEditTarget] = useState<AdminOrganizationListItem | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      organizations.map((org) =>
        toRow(org, subscriptions, plans, t('filters.plan.unavailable'))
      ),
    [organizations, subscriptions, plans, t]
  )

  const kpiCounts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((org) => org.uiStatus === 'active').length,
      suspended: rows.filter((org) => org.uiStatus === 'suspended').length,
      pending: rows.filter((org) => org.uiStatus === 'pending').length,
      archived: rows.filter((org) => org.uiStatus === 'archived').length,
    }),
    [rows]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    return rows.filter((org) => {
      if (statusFilter !== 'all' && org.uiStatus !== statusFilter) return false
      if (planFilter !== 'all' && org.planKey !== planFilter) return false

      const created = eventTime(org.createdAt)
      if (fromTime != null && (created == null || created < fromTime)) return false
      if (toTime != null && (created == null || created > toTime)) return false

      if (!query) return true
      return (
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query) ||
        org.email.toLowerCase().includes(query)
      )
    })
  }, [dateFrom, dateTo, planFilter, rows, search, statusFilter])

  const lastPage = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const currentPage = Math.min(page, lastPage)
  const paged = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)
  const selected = rows.find((org) => org.id === selectedId) ?? null

  // Reset page in event handlers rather than a useEffect to avoid
  // the cascading re-render that set-state-in-effect produces.
  function setSearchAndResetPage(value: string) {
    setSearch(value)
    setPage(1)
  }
  function setStatusFilterAndResetPage(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }
  function setPlanFilterAndResetPage(value: PlanFilter) {
    setPlanFilter(value)
    setPage(1)
  }
  function setDateFromAndResetPage(value: string) {
    setDateFrom(value)
    setPage(1)
  }
  function setDateToAndResetPage(value: string) {
    setDateTo(value)
    setPage(1)
  }

  function resetFilters() {
    setSearch('')
    setStatusFilter('all')
    setPlanFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const handleAction = useCallback(
    (action: OrganizationActionId, organization: AdminOrganizationListItem) => {
      setActionError(null)
      setActionMessage(null)

      if (action === 'view') {
        setSelectedId(organization.id)
        return
      }

      if (action === 'edit') {
        setEditTarget(organization)
        setEditForm(editFormFromOrg(organization))
        setEditError(null)
        return
      }

      if (action === 'suspend' || action === 'activate') {
        setStatusTarget(organization)
        return
      }

      if (action === 'delete') {
        setDeleteTarget(organization)
        setDeleteError(null)
      }
    },
    []
  )

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteSuperAdminOrganization(deleteTarget.id)
      patchOrganizations((prev) =>
        prev.map((org) =>
          org.id === deleteTarget.id
            ? { ...org, deletedAt: new Date().toISOString(), status: 'false', uiStatus: 'archived' }
            : org
        )
      )
      setActionMessage(t('toast.deleted', { name: deleteTarget.name }))
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      setStatusTarget(null)
    } catch (err) {
      setDeleteError(mapOrgApiError(err, t('errors.deleteFailed')))
    } finally {
      setDeletePending(false)
    }
  }

  async function handleEditSave() {
    if (!editTarget || !editForm) return
    const name = editForm.name.trim()
    if (name.length < 2) {
      setEditError(t('errors.nameRequired'))
      return
    }

    setEditPending(true)
    setEditError(null)
    try {
      const patch = {
        name,
        phone: editForm.phone.trim() || undefined,
        website: editForm.website.trim() || undefined,
        industry: editForm.industry.trim() || undefined,
        timezone: editForm.timezone.trim() || undefined,
        currency: editForm.currency.trim() || undefined,
      }
      const updated = await updateSuperAdminOrganization(editTarget.id, patch)
      patchOrganizations((prev) =>
        prev.map((org) => (org.id === updated.id ? { ...org, ...updated } : org))
      )
      setActionMessage(t('toast.updated', { name: updated.name }))
      setEditTarget(null)
      setEditForm(null)
    } catch (err) {
      setEditError(mapOrgApiError(err, t('errors.updateFailed')))
    } finally {
      setEditPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPIStatCard
          label={t('kpis.total.label')}
          value={kpiCounts.total}
          format="number"
          icon={Building2}
          hint={t('kpis.total.hint')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.active.label')}
          value={kpiCounts.active}
          format="number"
          icon={CheckCircle2}
          hint={t('kpis.active.hint')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.suspended.label')}
          value={kpiCounts.suspended}
          format="number"
          icon={PauseCircle}
          hint={t('kpis.suspended.hint')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.pending.label')}
          value={kpiCounts.pending}
          format="number"
          icon={Clock}
          hint={t('kpis.pending.hint')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.archived.label')}
          value={kpiCounts.archived}
          format="number"
          icon={Archive}
          hint={t('kpis.archived.hint')}
          loading={listLoading}
        />
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto_auto]">
            <div className="relative min-w-0">
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
                onChange={(event) => setSearchAndResetPage(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-11 rounded-xl border-dash-border bg-canvas pl-10 text-sm shadow-none"
              />
            </div>

            <select
              value={statusFilter}
              aria-label={t('statusFilterLabel')}
              onChange={(event) => setStatusFilterAndResetPage(event.target.value as StatusFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.status.all')}</option>
              <option value="active">{t('filters.status.active')}</option>
              <option value="suspended">{t('filters.status.suspended')}</option>
              <option value="pending">{t('filters.status.pending')}</option>
              <option value="archived">{t('filters.status.archived')}</option>
            </select>

            <select
              value={planFilter}
              aria-label={t('planFilterLabel')}
              onChange={(event) => setPlanFilterAndResetPage(event.target.value as PlanFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.plan.all')}</option>
              {planFilterOptions.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('filtersButton')}
            </Button>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={resetFilters}>
              <RotateCcw className="size-4" aria-hidden />
              {t('resetFilters')}
            </Button>
          </div>

          {showFilters ? (
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFromAndResetPage(event.target.value)}
                aria-label={t('dateFrom')}
                className="h-11 rounded-xl border-dash-border bg-canvas text-sm shadow-none"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateToAndResetPage(event.target.value)}
                aria-label={t('dateTo')}
                className="h-11 rounded-xl border-dash-border bg-canvas text-sm shadow-none"
              />
            </div>
          ) : null}
        </div>

        {actionMessage ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep"
          >
            {actionMessage}
          </p>
        ) : null}

        {actionError ? (
          <p role="alert" className="mt-4 text-sm text-negative">
            {actionError}
          </p>
        ) : null}

        {listError ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-sm text-negative">
              {listError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void orgsQuery.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : null}

        {listLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
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
                    {paged.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-sm text-mute">
                          {t('empty')}
                        </td>
                      </tr>
                    ) : (
                      paged.map((org, index) => (
                        <tr
                          key={org.id}
                          className={cn(
                            'cursor-pointer border-b border-dash-border last:border-b-0',
                            'transition-colors duration-150 hover:bg-primary-pale/30',
                            index % 2 === 1 && 'bg-dash-surface/60',
                            selectedId === org.id && 'bg-primary-pale/40'
                          )}
                          onClick={() => setSelectedId(org.id)}
                        >
                          <td className="px-4 py-3.5 sm:px-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary shadow-[0_4px_12px_rgb(37_99_235/0.25)]">
                                {getInitials(org.name)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-ink">
                                  {org.name}
                                </span>
                                <span className="block truncate text-xs text-mute">{org.slug}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="block truncate text-sm text-ink">{org.email}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <OrganizationPlanBadge label={org.planLabel} />
                          </td>
                          <td className="px-4 py-3.5">
                            <OrganizationStatusBadge
                              status={org.uiStatus}
                              label={t(`filters.status.${org.uiStatus}`)}
                            />
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-mute">
                            {t('emptyValue')}
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-body">
                            {formatCreatedDate(org.createdAt)}
                          </td>
                          <td
                            className="px-4 py-3.5 sm:px-5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <OrganizationActionsMenu organization={org} onAction={handleAction} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-3 md:hidden">
              {paged.length === 0 ? (
                <li className="rounded-2xl border border-dash-border bg-dash-surface/60 px-4 py-10 text-center text-sm text-mute">
                  {t('empty')}
                </li>
              ) : (
                paged.map((org) => (
                  <li key={org.id}>
                    <article
                      className={cn(
                        'rounded-2xl border border-dash-border bg-dash-surface/60 p-4',
                        'transition-colors duration-150',
                        selectedId === org.id && 'border-primary/40 bg-primary-pale/30'
                      )}
                      onClick={() => setSelectedId(org.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                            {getInitials(org.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{org.name}</p>
                            <p className="truncate text-xs text-mute">{org.slug}</p>
                          </div>
                        </div>
                        <div onClick={(event) => event.stopPropagation()}>
                          <OrganizationActionsMenu organization={org} onAction={handleAction} />
                        </div>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-mute">{t('columns.owner')}</dt>
                          <dd className="mt-0.5 truncate font-medium text-ink">{org.email}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-mute">{t('columns.members')}</dt>
                          <dd className="mt-0.5 tabular-nums font-medium text-mute">
                            {t('emptyValue')}
                          </dd>
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
                              status={org.uiStatus}
                              label={t(`filters.status.${org.uiStatus}`)}
                            />
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-xs text-mute">{t('columns.created')}</dt>
                          <dd className="mt-0.5 text-body">{formatCreatedDate(org.createdAt)}</dd>
                        </div>
                      </dl>
                    </article>
                  </li>
                ))
              )}
            </ul>

            {filtered.length > 0 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-mute">
                  {t('pagination', {
                    page: currentPage,
                    lastPage,
                    total: filtered.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    {t('prevPage')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= lastPage}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t('nextPage')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>

      <OrganizationDetailDrawer
        organization={selected}
        plans={plans}
        onClose={() => setSelectedId(null)}
        onViewOrganization={(org) => {
          setSelectedId(null)
          router.push(`/admin/organizations/${org.id}`)
        }}
        onChangeStatus={(org) => setStatusTarget(org)}
      />

      {statusTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setStatusTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={statusTitleId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={statusTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('statusDialog.title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-body">
              {statusTarget.uiStatus === 'archived'
                ? t('statusDialog.archivedBody', { name: statusTarget.name })
                : t('statusDialog.body', { name: statusTarget.name })}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
                {t('statusDialog.cancel')}
              </Button>
              {statusTarget.uiStatus === 'archived' ? null : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setDeleteTarget(statusTarget)
                    setDeleteError(null)
                    setStatusTarget(null)
                  }}
                >
                  {t('statusDialog.archive')}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!deletePending) setDeleteTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            aria-describedby={deleteDescId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={deleteTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('deleteConfirmTitle')}
            </h2>
            <p id={deleteDescId} className="mt-2 text-sm leading-6 text-body">
              {t('deleteConfirmBody', { name: deleteTarget.name })}
            </p>
            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={deletePending}
                onClick={() => setDeleteTarget(null)}
              >
                {t('deleteCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                className="gap-2"
                onClick={() => void handleDeleteConfirm()}
              >
                {deletePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('deleting')}
                  </>
                ) : (
                  t('deleteConfirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editTarget && editForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!editPending) {
              setEditTarget(null)
              setEditForm(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={editTitleId}
            className="flex h-[min(88vh,720px)] max-h-[88vh] w-full max-w-[min(94vw,880px)] flex-col overflow-hidden rounded-2xl border border-dash-border bg-canvas shadow-[0_20px_50px_rgb(15_23_42/0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-dash-border px-6 py-5 sm:px-8">
              <Pencil className="mt-1 size-5 shrink-0 text-mute" aria-hidden />
              <div>
                <h2
                  id={editTitleId}
                  className="font-display text-xl tracking-tight text-ink sm:text-2xl"
                >
                  {t('editTitle')}
                </h2>
                <p className="mt-1 text-sm text-body">
                  {t('editSubtitle', { name: editTarget.name })}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ['name', 'editFields.name'],
                    ['phone', 'editFields.phone'],
                    ['website', 'editFields.website'],
                    ['industry', 'editFields.industry'],
                    ['timezone', 'editFields.timezone'],
                    ['currency', 'editFields.currency'],
                  ] as const
                ).map(([key, labelKey]) => (
                  <div
                    key={key}
                    className={cn('flex flex-col gap-1.5', key === 'name' && 'sm:col-span-2')}
                  >
                    <label htmlFor={`edit-org-${key}`} className="text-sm font-medium text-ink">
                      {t(labelKey)}
                    </label>
                    <Input
                      id={`edit-org-${key}`}
                      value={editForm[key]}
                      onChange={(e) =>
                        setEditForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))
                      }
                      className="h-11 rounded-xl border-dash-border"
                      disabled={editPending}
                    />
                  </div>
                ))}
              </div>

              {editError ? (
                <p role="alert" className="mt-4 text-sm text-negative">
                  {editError}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-dash-border px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
              <Button
                type="button"
                variant="outline"
                disabled={editPending}
                onClick={() => {
                  setEditTarget(null)
                  setEditForm(null)
                }}
              >
                {t('editCancel')}
              </Button>
              <Button
                type="button"
                disabled={editPending}
                className="gap-2"
                onClick={() => void handleEditSave()}
              >
                {editPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('saving')}
                  </>
                ) : (
                  t('editSave')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
