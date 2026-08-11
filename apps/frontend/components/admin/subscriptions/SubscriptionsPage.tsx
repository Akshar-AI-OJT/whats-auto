'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  listSuperAdminOrganizations,
  type AdminOrganizationListItem,
} from '@/components/admin/organizations/organization-api'
import { MOCK_PLATFORM_PLANS, type PlatformPlanId } from '../mock-data'
import {
  createSuperAdminSubscription,
  dateInputToIso,
  deleteSuperAdminSubscription,
  DEMO_PLAN_OPTIONS,
  isoToDateInput,
  listSuperAdminSubscriptions,
  mapSubscriptionApiError,
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

type SubscriptionFormState = {
  organizationId: string
  planId: string
  status: SuperAdminSubscriptionStatus
  startDate: string
  endDate: string
}

function emptyCreateForm(): SubscriptionFormState {
  return {
    organizationId: '',
    planId: DEMO_PLAN_OPTIONS[0]?.id ?? '',
    status: 'active',
    startDate: '',
    endDate: '',
  }
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

function formatDisplayDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'active'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'trialing'
        ? 'bg-dash-surface text-ink ring-dash-border'
        : status === 'past_due'
          ? 'bg-negative/10 text-negative ring-negative/25'
          : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ring-1',
        tone
      )}
    >
      {label}
    </span>
  )
}

export function SubscriptionsPage() {
  const t = useTranslations('admin.subscriptions')
  const createTitleId = useId()
  const editTitleId = useId()
  const deleteTitleId = useId()
  const deleteDescId = useId()

  const [subscriptions, setSubscriptions] = useState<SuperAdminSubscription[]>([])
  const [organizations, setOrganizations] = useState<AdminOrganizationListItem[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<SubscriptionFormState>(emptyCreateForm)
  const [createPending, setCreatePending] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<SuperAdminSubscription | null>(null)
  const [editForm, setEditForm] = useState<SubscriptionFormState | null>(null)
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<SuperAdminSubscription | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const org of organizations) map.set(org.id, org.name)
    return map
  }, [organizations])

  const loadOrganizations = useCallback(async () => {
    try {
      const { items } = await listSuperAdminOrganizations({ page: 1, perPage: 100 })
      setOrganizations(items)
    } catch {
      setOrganizations([])
    }
  }, [])

  const loadSubscriptions = useCallback(
    async (nextPage: number) => {
      setListLoading(true)
      setListError(null)
      try {
        const { items, meta } = await listSuperAdminSubscriptions({
          page: nextPage,
          perPage: PER_PAGE,
        })
        setSubscriptions(items)
        setPage(meta?.currentPage ?? nextPage)
        setLastPage(meta?.lastPage ?? 1)
        setTotal(meta?.total ?? items.length)
      } catch (err) {
        setSubscriptions([])
        setListError(mapSubscriptionApiError(err, t('errors.loadFailed')))
      } finally {
        setListLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    void loadSubscriptions(1)
    void loadOrganizations()
  }, [loadSubscriptions, loadOrganizations])

  function validateForm(form: SubscriptionFormState, requireOrg: boolean): string | null {
    if (requireOrg && !UUID_RE.test(form.organizationId.trim())) {
      return t('errors.organizationRequired')
    }
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

  async function handleCreateSave() {
    const validation = validateForm(createForm, true)
    if (validation) {
      setCreateError(validation)
      return
    }

    setCreatePending(true)
    setCreateError(null)
    try {
      await createSuperAdminSubscription({
        organizationId: createForm.organizationId.trim(),
        planId: createForm.planId.trim(),
        status: createForm.status,
        currentPeriodStart: dateInputToIso(createForm.startDate),
        currentPeriodEnd: dateInputToIso(createForm.endDate, true),
      })
      setActionMessage(t('toast.created'))
      setActionError(null)
      setCreateOpen(false)
      setCreateForm(emptyCreateForm())
      await loadSubscriptions(1)
    } catch (err) {
      setCreateError(mapSubscriptionApiError(err, t('errors.createFailed')))
    } finally {
      setCreatePending(false)
    }
  }

  async function handleEditSave() {
    if (!editTarget || !editForm) return
    const validation = validateForm(editForm, false)
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
      setSubscriptions((prev) =>
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
      setSubscriptions((prev) => prev.filter((row) => row.id !== deleteTarget.id))
      setTotal((prev) => Math.max(0, prev - 1))
      setActionMessage(t('toast.deleted'))
      setActionError(null)
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(mapSubscriptionApiError(err, t('errors.deleteFailed')))
    } finally {
      setDeletePending(false)
    }
  }

  function planKeyFromPlanId(planId: string): PlatformPlanId {
    const starterId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Starter')?.id
    const growthId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Growth')?.id
    const scaleId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Scale')?.id

    if (starterId && planId === starterId) return 'starter'
    if (growthId && planId === growthId) return 'growth'
    if (scaleId && planId === scaleId) return 'scale'
    return 'enterprise'
  }

  function formatLimit(value: number | null, unlimitedLabel: string) {
    if (value == null) return unlimitedLabel
    return value.toLocaleString('en-US')
  }

  function renderFormFields(
    form: SubscriptionFormState,
    setForm: (next: SubscriptionFormState) => void,
    pending: boolean,
    options: { includeOrganization: boolean }
  ) {
    return (
      <div className="mt-5 flex flex-col gap-3">
        {options.includeOrganization ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sub-org" className="text-sm font-medium text-ink">
              {t('fields.organizationId')}
            </label>
            <select
              id="sub-org"
              value={form.organizationId}
              disabled={pending}
              onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
              className={selectClassName}
            >
              <option value="">{t('fields.organizationPlaceholder')}</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{t('fields.planId')}</label>

            {/* Show 2 cards per row in the modal to reduce vertical scrolling */}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {MOCK_PLATFORM_PLANS.map((plan) => {
                const isSelected = planKeyFromPlanId(form.planId) === plan.id
                const isEnterprise = plan.id === 'enterprise'

                const price =
                  plan.priceMonthly == null
                    ? t('customPrice')
                    : `$${plan.priceMonthly.toLocaleString('en-US')}`

                const perMonth = t('perMonth')
                const unlimited = t('unlimited')

                const starterId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Starter')?.id
                const growthId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Growth')?.id
                const scaleId = DEMO_PLAN_OPTIONS.find((p) => p.label === 'Scale')?.id

                const nextPlanId =
                  plan.id === 'starter'
                    ? starterId ?? ''
                    : plan.id === 'growth'
                      ? growthId ?? ''
                      : plan.id === 'scale'
                        ? scaleId ?? ''
                        : ''

                return (
                  <button
                    key={plan.id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setForm({ ...form, planId: isEnterprise ? '' : nextPlanId })
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      'group relative flex flex-col gap-3 rounded-2xl p-3 text-left sm:p-4',
                      'border bg-canvas/70 transition-[border-color,box-shadow,transform] duration-200 ease-out',
                      isSelected
                        ? 'border-primary/60 shadow-[0_0_0_1px_rgb(159_232_112/0.28)]'
                        : 'border-[#E2E8F0] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm'
                    )}
                  >
                    {plan.highlighted ? (
                      <span className="absolute right-4 top-4 rounded-lg bg-primary-pale px-2 py-0.5 text-[11px] font-semibold text-positive-deep ring-1 ring-primary/30">
                        {t('popular')}
                      </span>
                    ) : null}

                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
                        {t(`plans.${plan.id}.name`)}
                      </h3>
                      <p className="mt-1 break-words text-sm leading-6 text-mute">
                        {t(`plans.${plan.id}.description`)}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">
                        {price}
                      </span>
                      {plan.priceMonthly != null ? (
                        <span className="text-sm text-mute">{perMonth}</span>
                      ) : null}
                    </div>

                    <dl className="grid gap-2 rounded-2xl border border-dash-border bg-dash-surface/70 p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <dt className="text-mute">{t('limits.users')}</dt>
                        <dd className="font-semibold tabular-nums text-ink">
                          {formatLimit(plan.userLimit, unlimited)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <dt className="text-mute">{t('limits.messages')}</dt>
                        <dd className="font-semibold tabular-nums text-ink">
                          {formatLimit(plan.messageLimit, unlimited)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <dt className="text-mute">{t('limits.workspaces')}</dt>
                        <dd className="font-semibold tabular-nums text-ink">
                          {formatLimit(plan.workspaceLimit, unlimited)}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                        {t('featuresLabel')}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {plan.featureKeys.map((key) => (
                          <li
                            key={key}
                            className="flex items-start gap-2 text-sm text-body"
                          >
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary-pale text-positive-deep">
                              <Check className="size-3.5" aria-hidden />
                            </span>
                            <span>{t(`features.${key}`)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {planKeyFromPlanId(form.planId) === 'enterprise' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sub-plan-custom" className="text-sm font-medium text-ink">
                {t('fields.planId')}
              </label>
              <Input
                id="sub-plan-custom"
                value={form.planId}
                disabled={pending}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
                className="h-11 rounded-xl border-dash-border"
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <p className="text-xs leading-4 text-mute">
                Enter the enterprise plan UUID to create this subscription.
              </p>
            </div>
          ) : null}
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
              setForm({
                ...form,
                status: e.target.value as SuperAdminSubscriptionStatus,
              })
            }
            className={selectClassName}
          >
            {SUBSCRIPTION_STATUSES.filter((status) => status !== 'cancelled').map((status) => (
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <DashboardSectionHeader
            title={t('tableTitle')}
            description={t('tableDescription', { count: total })}
          />
          <Button
            type="button"
            className="gap-2 shrink-0"
            onClick={() => {
              setCreateForm(emptyCreateForm())
              setCreateError(null)
              setCreateOpen(true)
              setActionMessage(null)
              setActionError(null)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t('create')}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSubscriptions(page)}
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
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-dash-border bg-dash-surface">
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        {t('columns.organization')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.plan')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.status')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.period')}
                      </th>
                      <th className="px-4 py-3.5 text-right text-sm font-semibold text-ink sm:px-5">
                        {t('columns.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-sm text-mute">
                          {t('empty')}
                        </td>
                      </tr>
                    ) : (
                      subscriptions.map((sub, index) => (
                        <tr
                          key={sub.id}
                          className={cn(
                            'border-b border-dash-border last:border-b-0',
                            'transition-colors duration-150',
                            index % 2 === 1 && 'bg-dash-surface/60'
                          )}
                        >
                          <td className="px-4 py-3.5 sm:px-5">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {orgNameById.get(sub.organizationId) ??
                                sub.organizationId.slice(0, 8)}
                            </span>
                            <span className="block truncate text-xs text-mute">
                              {sub.organizationId}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-sm font-medium text-ink">
                            {planLabel(sub.planId)}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge
                              status={sub.status}
                              label={
                                SUBSCRIPTION_STATUSES.includes(
                                  sub.status as SuperAdminSubscriptionStatus
                                )
                                  ? t(`statuses.${sub.status as SuperAdminSubscriptionStatus}`)
                                  : sub.status
                              }
                            />
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-body">
                            {formatDisplayDate(sub.currentPeriodStart)} –{' '}
                            {formatDisplayDate(sub.currentPeriodEnd)}
                          </td>
                          <td className="px-4 py-3.5 sm:px-5">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => {
                                  setEditTarget(sub)
                                  setEditForm(formFromSubscription(sub))
                                  setEditError(null)
                                  setActionMessage(null)
                                }}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                {t('actions.edit')}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-negative hover:text-negative"
                                onClick={() => {
                                  setDeleteTarget(sub)
                                  setDeleteError(null)
                                }}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                                {t('actions.delete')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-3 md:hidden">
              {subscriptions.length === 0 ? (
                <li className="rounded-2xl border border-dash-border bg-dash-surface/60 px-4 py-10 text-center text-sm text-mute">
                  {t('empty')}
                </li>
              ) : (
                subscriptions.map((sub) => (
                  <li key={sub.id}>
                    <article className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {orgNameById.get(sub.organizationId) ??
                              sub.organizationId.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-xs text-mute">{planLabel(sub.planId)}</p>
                        </div>
                        <StatusBadge
                          status={sub.status}
                          label={
                            SUBSCRIPTION_STATUSES.includes(
                              sub.status as SuperAdminSubscriptionStatus
                            )
                              ? t(`statuses.${sub.status as SuperAdminSubscriptionStatus}`)
                              : sub.status
                          }
                        />
                      </div>
                      <p className="mt-3 text-xs tabular-nums text-body">
                        {formatDisplayDate(sub.currentPeriodStart)} –{' '}
                        {formatDisplayDate(sub.currentPeriodEnd)}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setEditTarget(sub)
                            setEditForm(formFromSubscription(sub))
                            setEditError(null)
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          {t('actions.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-negative"
                          onClick={() => {
                            setDeleteTarget(sub)
                            setDeleteError(null)
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          {t('actions.delete')}
                        </Button>
                      </div>
                    </article>
                  </li>
                ))
              )}
            </ul>

            {lastPage > 1 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-mute">
                  {t('pagination', { page, lastPage, total })}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || listLoading}
                    onClick={() => void loadSubscriptions(page - 1)}
                  >
                    {t('prevPage')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage || listLoading}
                    onClick={() => void loadSubscriptions(page + 1)}
                  >
                    {t('nextPage')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!createPending) setCreateOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={createTitleId}
            className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={createTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('createTitle')}
            </h2>
            <p className="mt-1 text-sm text-body">{t('createSubtitle')}</p>
            {renderFormFields(createForm, setCreateForm, createPending, {
              includeOrganization: true,
            })}
            {createError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {createError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={createPending}
                onClick={() => setCreateOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                disabled={createPending}
                className="gap-2"
                onClick={() => void handleCreateSave()}
              >
                {createPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('saving')}
                  </>
                ) : (
                  t('createSave')
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
            className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={editTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('editTitle')}
            </h2>
            <p className="mt-1 text-sm text-body">
              {t('editSubtitle', {
                name:
                  orgNameById.get(editTarget.organizationId) ??
                  editTarget.organizationId.slice(0, 8),
              })}
            </p>
            {renderFormFields(
              editForm,
              (next) => setEditForm(next),
              editPending,
              { includeOrganization: false }
            )}
            {editError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {editError}
              </p>
            ) : null}
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
              {t('deleteConfirmBody', {
                name:
                  orgNameById.get(deleteTarget.organizationId) ??
                  deleteTarget.organizationId.slice(0, 8),
              })}
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
                {t('cancel')}
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
    </div>
  )
}
