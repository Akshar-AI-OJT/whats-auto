'use client'

import { useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  Download,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import {
  listSuperAdminOrganizations,
  type AdminOrganizationListItem,
} from '@/components/admin/organizations/organization-api'
import { SubscriptionDetailPanel } from './SubscriptionDetailPanel'
import {
  dateInputToIso,
  deleteSuperAdminSubscription,
  DEMO_PLAN_OPTIONS,
  isoToDateInput,
  listSuperAdminSubscriptions,
  mapSubscriptionApiError,
  planAmountLabel,
  planBillingKind,
  planLabel,
  SUBSCRIPTION_STATUSES,
  updateSuperAdminSubscription,
} from './subscription-api'
import type {
  SuperAdminSubscription,
  SuperAdminSubscriptionStatus,
} from '@/lib/api'

const PER_PAGE = 20

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StatusFilter = 'all' | SuperAdminSubscriptionStatus
type PlanFilter = 'all' | string
type BillingFilter = 'all' | 'monthly' | 'custom'

type SubscriptionFormState = {
  organizationId: string
  planId: string
  status: SuperAdminSubscriptionStatus
  startDate: string
  endDate: string
}

function formFromSubscription(sub: SuperAdminSubscription): SubscriptionFormState {
  return {
    organizationId: sub.organizationId,
    planId: sub.planId,
    status: (SUBSCRIPTION_STATUSES.includes(sub.status as SuperAdminSubscriptionStatus)
      ? sub.status
      : 'active') as SuperAdminSubscriptionStatus,
    startDate: isoToDateInput(sub.currentPeriodStart),
    endDate: isoToDateInput(sub.currentPeriodEnd),
  }
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return '—'
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

function statusLabelKey(status: string): SuperAdminSubscriptionStatus | null {
  return SUBSCRIPTION_STATUSES.includes(status as SuperAdminSubscriptionStatus)
    ? (status as SuperAdminSubscriptionStatus)
    : null
}

function relativeFromEnd(
  value: string,
  t: (key: string, values?: Record<string, number>) => string
) {
  const end = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const days = Math.round((end.getTime() - Date.now()) / 86_400_000)
  if (days === 0) return { text: t('relative.today'), overdue: false }
  if (days > 0) return { text: t('relative.inDays', { count: days }), overdue: false }
  return { text: t('relative.overdue', { count: Math.abs(days) }), overdue: true }
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'active'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'trialing'
        ? 'bg-[#F3E8FF] text-[#6B21A8] ring-[#C084FC]/40'
        : status === 'past_due'
          ? 'bg-negative/10 text-negative ring-negative/25'
          : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span className={cn('inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ring-1', tone)}>
      {label}
        </span>
  )
}

export function SubscriptionsPage() {
  const t = useTranslations('admin.subscriptions')
  const queryClient = useQueryClient()
  const editTitleId = useId()
  const deleteTitleId = useId()
  const deleteDescId = useId()
  const searchId = useId()

  const [page, setPage] = useState(1)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<SuperAdminSubscription | null>(null)
  const [editForm, setEditForm] = useState<SubscriptionFormState | null>(null)
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<SuperAdminSubscription | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const subsQueryKey = queryKeys.admin.subscriptions({ page, perPage: PER_PAGE })
  const subsQuery = useQuery({
    queryKey: subsQueryKey,
    queryFn: async () => {
      const { items, meta } = await listSuperAdminSubscriptions({
        page,
        perPage: PER_PAGE,
      })
      return {
        items,
        page: meta?.currentPage ?? page,
        lastPage: meta?.lastPage ?? 1,
        total: meta?.total ?? items.length,
      }
    },
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const orgsQuery = useQuery({
    queryKey: queryKeys.admin.organizations({ page: 1, perPage: 100 }),
    queryFn: async () => {
      const { items } = await listSuperAdminOrganizations({ page: 1, perPage: 100 })
      return items
    },
    staleTime: 5 * 60_000,
  })

  const subscriptions = useMemo(
    () => subsQuery.data?.items ?? [],
    [subsQuery.data]
  )
  const organizations = useMemo(
    () => orgsQuery.data ?? [],
    [orgsQuery.data]
  )
  const lastPage = subsQuery.data?.lastPage ?? 1
  const total = subsQuery.data?.total ?? 0
  const listLoading = subsQuery.isLoading
  const listError = subsQuery.error
    ? mapSubscriptionApiError(subsQuery.error, t('errors.loadFailed'))
    : null

  function patchSubscriptions(
    updater: (prev: SuperAdminSubscription[]) => SuperAdminSubscription[]
  ) {
    queryClient.setQueryData<typeof subsQuery.data>(subsQueryKey, (old) => {
      if (!old) return old
      return { ...old, items: updater(old.items) }
    })
  }

  const orgById = useMemo(() => {
    const map = new Map<string, AdminOrganizationListItem>()
    for (const org of organizations) map.set(org.id, org)
    return map
  }, [organizations])

  const visibleSubscriptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subscriptions.filter((sub) => {
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false
      if (planFilter !== 'all' && sub.planId !== planFilter) return false
      if (billingFilter !== 'all' && planBillingKind(sub.planId) !== billingFilter) return false
      if (!q) return true
      const orgName = orgById.get(sub.organizationId)?.name.toLowerCase() ?? ''
      const website = orgById.get(sub.organizationId)?.website?.toLowerCase() ?? ''
      const plan = planLabel(sub.planId).toLowerCase()
      return (
        orgName.includes(q) ||
        website.includes(q) ||
        plan.includes(q) ||
        sub.status.toLowerCase().includes(q) ||
        sub.organizationId.toLowerCase().includes(q)
      )
    })
  }, [subscriptions, search, statusFilter, planFilter, billingFilter, orgById])

  const selected = visibleSubscriptions.find((sub) => sub.id === selectedId) ?? null

  const kpiCounts = useMemo(() => {
    const counts = { active: 0, trialing: 0, past_due: 0, cancelled: 0 }
    for (const sub of subscriptions) {
      if (sub.status === 'active') counts.active += 1
      else if (sub.status === 'trialing') counts.trialing += 1
      else if (sub.status === 'past_due') counts.past_due += 1
      else if (sub.status === 'cancelled') counts.cancelled += 1
    }
    return counts
  }, [subscriptions])

  function validateForm(form: SubscriptionFormState): string | null {
    if (!UUID_RE.test(form.planId.trim())) {
      return t('errors.planRequired')
    }
    if (!form.startDate.trim() || !form.endDate.trim()) {
      return t('errors.datesRequired')
    }
    if (new Date(dateInputToIso(form.endDate, true)) <= new Date(dateInputToIso(form.startDate))) {
      return t('errors.periodInvalid')
    }
    return null
  }

  async function handleEditSave() {
    if (!editTarget || !editForm) return
    const validation = validateForm(editForm)
    if (validation) {
      setEditError(validation)
      return
    }
    setEditPending(true)
    setEditError(null)
    try {
      const updated = await updateSuperAdminSubscription(editTarget.id, {
        planId: editForm.planId.trim(),
        status: editForm.status,
        currentPeriodStart: dateInputToIso(editForm.startDate),
        currentPeriodEnd: dateInputToIso(editForm.endDate, true),
      })
      patchSubscriptions((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
      )
      setActionMessage(t('toast.updated'))
      setActionError(null)
      setEditTarget(null)
      setEditForm(null)
    } catch (err) {
      setEditError(mapSubscriptionApiError(err, t('errors.updateFailed')))
    } finally {
      setEditPending(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteSuperAdminSubscription(deleteTarget.id)
      patchSubscriptions((prev) => prev.filter((row) => row.id !== deleteTarget.id))
      queryClient.setQueryData<typeof subsQuery.data>(subsQueryKey, (old) => {
        if (!old) return old
        return { ...old, total: Math.max(0, old.total - 1) }
      })
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setActionMessage(t('toast.deleted'))
      setActionError(null)
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(mapSubscriptionApiError(err, t('errors.deleteFailed')))
    } finally {
      setDeletePending(false)
    }
  }

  function openEdit(sub: SuperAdminSubscription) {
    setEditTarget(sub)
    setEditForm(formFromSubscription(sub))
    setEditError(null)
    setMenuId(null)
    setActionMessage(null)
  }

  function renderStatus(status: string) {
    const key = statusLabelKey(status)
    return <StatusBadge status={status} label={key ? t(`statuses.${key}`) : status} />
  }

  function renderOrgCell(sub: SuperAdminSubscription) {
    const org = orgById.get(sub.organizationId)
    const name = org?.name ?? sub.organizationId.slice(0, 8)
    const website = org?.website?.trim() || org?.slug || null

    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-pale text-xs font-semibold text-positive-deep">
          {getInitials(name) || 'OR'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {website ? <p className="truncate text-xs text-mute">{website}</p> : null}
        </div>
      </div>
    )
  }

  function renderFormFields(
    form: SubscriptionFormState,
    setForm: (next: SubscriptionFormState) => void,
    pending: boolean
  ) {
    return (
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sub-plan" className="text-sm font-medium text-ink">
            {t('fields.planId')}
          </label>
          <select
            id="sub-plan"
            value={form.planId}
            disabled={pending}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
            className={selectClassName}
          >
            {DEMO_PLAN_OPTIONS.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sub-status" className="text-sm font-medium text-ink">
            {t('fields.status')}
          </label>
          <select
            id="sub-status"
            value={form.status}
            disabled={pending}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as SuperAdminSubscriptionStatus })
            }
            className={selectClassName}
          >
            {SUBSCRIPTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sub-start" className="text-sm font-medium text-ink">
              {t('fields.startDate')}
            </label>
            <Input
              id="sub-start"
              type="date"
              value={form.startDate}
              disabled={pending}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="h-11 rounded-xl border-dash-border"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sub-end" className="text-sm font-medium text-ink">
              {t('fields.endDate')}
            </label>
            <Input
              id="sub-end"
              type="date"
              value={form.endDate}
              disabled={pending}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="h-11 rounded-xl border-dash-border"
            />
          </div>
        </div>
      </div>
  )
}

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 self-start sm:self-auto"
          onClick={() => setActionMessage(t('exportSoon'))}
        >
          <Download className="size-4" aria-hidden />
          {t('export')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPIStatCard
          label={t('kpis.total')}
          value={total}
          format="number"
          icon={CreditCard}
          hint={t('tableDescription', { count: total })}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.active')}
          value={kpiCounts.active}
          format="number"
          icon={CreditCard}
          hint={t('kpis.thisPage')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.trial')}
          value={kpiCounts.trialing}
          format="number"
          icon={CreditCard}
          hint={t('kpis.thisPage')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.pastDue')}
          value={kpiCounts.past_due}
          format="number"
          icon={CreditCard}
          hint={t('kpis.thisPage')}
          loading={listLoading}
        />
        <KPIStatCard
          label={t('kpis.cancelled')}
          value={kpiCounts.cancelled}
          format="number"
          icon={CreditCard}
          hint={t('kpis.thisPage')}
          loading={listLoading}
        />
      </div>

      <div className={cn('flex min-h-0 flex-col gap-4', selected ? 'xl:flex-row' : '')}>
        <DashboardPanel as="section" className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem_auto]">
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={searchId}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-11 rounded-xl border-dash-border bg-canvas pl-9 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectClassName}
              aria-label={t('filterStatus')}
            >
              <option value="all">{t('filterAll')}</option>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className={selectClassName}
              aria-label={t('filterPlan')}
            >
              <option value="all">{t('filterAll')}</option>
              {DEMO_PLAN_OPTIONS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </select>
            <select
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value as BillingFilter)}
              className={selectClassName}
              aria-label={t('filterBilling')}
            >
              <option value="all">{t('filterAll')}</option>
              <option value="monthly">{t('billingMonthly')}</option>
              <option value="custom">{t('billingCustom')}</option>
            </select>
            <Button type="button" variant="outline" className="h-11 gap-2">
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('filters')}
            </Button>
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
              <Button type="button" variant="outline" size="sm" onClick={() => void subsQuery.refetch()}>
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
              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-dash-border bg-dash-surface/80">
                        {[
                          'organization',
                          'plan',
                          'status',
                          'billing',
                          'amount',
                          'nextBilling',
                          'startedOn',
                          'actions',
                        ].map((col) => (
                          <th
                            key={col}
                            className={cn(
                              'px-4 py-3 text-xs font-semibold tracking-wide text-mute uppercase',
                              col === 'actions' && 'text-right'
                            )}
                          >
                            {t(`columns.${col}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSubscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-sm text-mute">
                            {search.trim() || statusFilter !== 'all' || planFilter !== 'all'
                              ? t('noMatches')
                              : t('empty')}
                          </td>
                        </tr>
                      ) : (
                        visibleSubscriptions.map((sub) => {
                          const relative = relativeFromEnd(sub.currentPeriodEnd, t)
                          const isSelected = selectedId === sub.id
                          return (
                            <tr
                              key={sub.id}
                              onClick={() => setSelectedId(sub.id)}
                              className={cn(
                                'cursor-pointer border-b border-dash-border last:border-b-0 transition-colors',
                                isSelected ? 'bg-primary-pale/50' : 'hover:bg-dash-surface/50'
                              )}
                            >
                              <td className="px-4 py-3">{renderOrgCell(sub)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-ink">
                                {planLabel(sub.planId)}
                              </td>
                              <td className="px-4 py-3">{renderStatus(sub.status)}</td>
                              <td className="px-4 py-3 text-sm text-body">
                                {planBillingKind(sub.planId) === 'custom'
                                  ? t('billingCustom')
                                  : t('billingMonthly')}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium tabular-nums text-ink">
                                {planAmountLabel(sub.planId, t('customPrice'))}
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-sm tabular-nums text-ink">
                                  {formatDisplayDate(sub.currentPeriodEnd)}
                                </p>
                                {relative ? (
                                  <p
                                    className={cn(
                                      'text-xs',
                                      relative.overdue ? 'text-negative' : 'text-positive-deep'
                                    )}
                                  >
                                    {relative.text}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-sm tabular-nums text-body">
                                {formatDisplayDate(sub.currentPeriodStart)}
                              </td>
                              <td className="relative px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                                  aria-label={t('actions.openMenu')}
                                  onClick={() => setMenuId((id) => (id === sub.id ? null : sub.id))}
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                                {menuId === sub.id ? (
                                  <div className="absolute right-4 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-lg">
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
                                      onClick={() => openEdit(sub)}
                                    >
                                      <Pencil className="size-3.5" />
                                      {t('actions.edit')}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-mute"
                                      disabled
                                      title={t('actions.pauseSoon')}
                                    >
                                      <PauseCircle className="size-3.5" />
                                      {t('actions.pause')}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-negative hover:bg-negative/5"
                                      onClick={() => {
                                        setDeleteTarget(sub)
                                        setDeleteError(null)
                                        setMenuId(null)
                                      }}
                                    >
                                      <Trash2 className="size-3.5" />
                                      {t('actions.delete')}
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="mt-4 flex flex-col gap-3 md:hidden">
                {visibleSubscriptions.length === 0 ? (
                  <li className="rounded-2xl border border-dash-border px-4 py-10 text-center text-sm text-mute">
                    {t('empty')}
                  </li>
                ) : (
                  visibleSubscriptions.map((sub) => (
                    <li key={sub.id}>
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-dash-border bg-dash-surface/60 p-4 text-left"
                        onClick={() => setSelectedId(sub.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {renderOrgCell(sub)}
                          {renderStatus(sub.status)}
                        </div>
                        <p className="mt-3 text-sm text-body">
                          {planLabel(sub.planId)} · {planAmountLabel(sub.planId, t('customPrice'))}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-mute">
                  {t('showingRange', { start: rangeStart, end: rangeEnd, total })}
                </p>
                {lastPage > 1 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || listLoading}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('prevPage')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= lastPage || listLoading}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('nextPage')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DashboardPanel>

        {selected ? (
          <SubscriptionDetailPanel
            subscription={selected}
            organization={orgById.get(selected.organizationId)}
            onClose={() => setSelectedId(null)}
            onChangePlan={() => openEdit(selected)}
            onCancelSubscription={() => {
              setDeleteTarget(selected)
              setDeleteError(null)
            }}
          />
        ) : null}
      </div>

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
            className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-dash-border bg-canvas p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={editTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('editTitle')}
            </h2>
            <p className="mt-1 text-sm text-body">
              {t('editSubtitle', {
                name: orgById.get(editTarget.organizationId)?.name ?? editTarget.organizationId.slice(0, 8),
              })}
            </p>
            {renderFormFields(editForm, (next) => setEditForm(next), editPending)}
            {editError ? <p role="alert" className="mt-3 text-sm text-negative">{editError}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={editPending}
                onClick={() => {
                  setEditTarget(null)
                  setEditForm(null)
                }}
              >
                {t('cancel')}
              </Button>
              <Button type="button" disabled={editPending} className="gap-2" onClick={() => void handleEditSave()}>
                {editPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editPending ? t('saving') : t('editSave')}
              </Button>
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
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={deleteTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('deleteConfirmTitle')}
            </h2>
            <p id={deleteDescId} className="mt-2 text-sm leading-6 text-body">
              {t('deleteConfirmBody', {
                name: orgById.get(deleteTarget.organizationId)?.name ?? deleteTarget.organizationId.slice(0, 8),
              })}
            </p>
            {deleteError ? <p role="alert" className="mt-3 text-sm text-negative">{deleteError}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={deletePending} onClick={() => setDeleteTarget(null)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                className="gap-2"
                onClick={() => void handleDeleteConfirm()}
              >
                {deletePending ? <Loader2 className="size-4 animate-spin" /> : null}
                {deletePending ? t('deleting') : t('deleteConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
