'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, ExternalLink, Loader2, Pause, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { findSuperAdminOrganization } from '@/components/admin/organizations/organization-api'
import type {
  SuperAdminPlan,
  SuperAdminSubscription,
  SuperAdminSubscriptionStatus,
} from '@/lib/api'
import {
  dateInputToIso,
  deleteSuperAdminSubscription,
  getSuperAdminSubscription,
  isoToDateInput,
  listSuperAdminPlansCatalog,
  mapSubscriptionApiError,
  planAmountLabel,
  planBillingKind,
  planLabel,
  SUBSCRIPTION_STATUSES,
  toPlanSelectOptions,
  updateSuperAdminSubscription,
  findPlanById,
} from './subscription-api'

const quickActionClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-sm font-medium'
)

const selectClassName = cn(
  'h-11 w-full min-w-0 cursor-pointer rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type DetailTab = 'overview' | 'usage' | 'billing'

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

function LimitRow({
  label,
  limit,
  unlimited,
}: {
  label: string
  limit: number | null | undefined
  unlimited: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="tabular-nums text-ink">
          {limit == null ? unlimited : `— / ${limit.toLocaleString('en-US')}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-dash-surface">
        <div className="h-full w-0 rounded-full bg-primary" />
      </div>
    </div>
  )
}

type SubscriptionDetailsPageProps = {
  subscriptionId: string
}

export function SubscriptionDetailsPage({ subscriptionId }: SubscriptionDetailsPageProps) {
  const t = useTranslations('admin.subscriptions')
  const router = useRouter()
  const queryClient = useQueryClient()
  const editTitleId = useId()
  const deleteTitleId = useId()
  const deleteDescId = useId()

  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<SubscriptionFormState | null>(null)
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.admin.subscriptionDetail(subscriptionId),
    queryFn: () => getSuperAdminSubscription(subscriptionId),
    staleTime: 60_000,
  })

  const plansQuery = useQuery({
    queryKey: queryKeys.admin.plans({ status: 'all', scope: 'subscription-catalog' }),
    queryFn: () => listSuperAdminPlansCatalog('all'),
    staleTime: 60_000,
  })

  const subscription = subscriptionQuery.data ?? null
  const plans = useMemo((): SuperAdminPlan[] => plansQuery.data ?? [], [plansQuery.data])

  const organizationQuery = useQuery({
    queryKey: ['admin', 'organizations', 'lookup', subscription?.organizationId ?? null],
    queryFn: async () => {
      if (!subscription?.organizationId) return null
      return findSuperAdminOrganization(subscription.organizationId)
    },
    enabled: Boolean(subscription?.organizationId),
    staleTime: 5 * 60_000,
  })

  const organization = organizationQuery.data ?? undefined
  const planOptions = useMemo(
    () =>
      toPlanSelectOptions(plans, {
        activeOnly: true,
        includeIds: [editForm?.planId, subscription?.planId].filter((id): id is string =>
          Boolean(id)
        ),
      }),
    [plans, editForm?.planId, subscription?.planId]
  )

  const loading = subscriptionQuery.isLoading || plansQuery.isLoading
  const loadError = subscriptionQuery.isError
    ? mapSubscriptionApiError(subscriptionQuery.error, t('errors.loadFailed'))
    : null

  function validateForm(form: SubscriptionFormState): string | null {
    if (!UUID_RE.test(form.planId.trim())) return t('errors.planRequired')
    if (!form.startDate.trim() || !form.endDate.trim()) return t('errors.datesRequired')
    if (new Date(dateInputToIso(form.endDate, true)) <= new Date(dateInputToIso(form.startDate))) {
      return t('errors.periodInvalid')
    }
    return null
  }

  function openEdit() {
    if (!subscription) return
    setEditForm(formFromSubscription(subscription))
    setEditError(null)
    setEditOpen(true)
    setActionMessage(null)
  }

  async function handleEditSave() {
    if (!subscription || !editForm) return
    const validation = validateForm(editForm)
    if (validation) {
      setEditError(validation)
      return
    }
    setEditPending(true)
    setEditError(null)
    try {
      const updated = await updateSuperAdminSubscription(subscription.id, {
        planId: editForm.planId.trim(),
        status: editForm.status,
        currentPeriodStart: dateInputToIso(editForm.startDate),
        currentPeriodEnd: dateInputToIso(editForm.endDate, true),
      })
      queryClient.setQueryData(queryKeys.admin.subscriptionDetail(subscriptionId), updated)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setActionMessage(t('toast.updated'))
      setEditOpen(false)
      setEditForm(null)
    } catch (err) {
      setEditError(mapSubscriptionApiError(err, t('errors.updateFailed')))
    } finally {
      setEditPending(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!subscription) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteSuperAdminSubscription(subscription.id)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      router.replace('/admin/subscriptions')
    } catch (err) {
      setDeleteError(mapSubscriptionApiError(err, t('errors.deleteFailed')))
    } finally {
      setDeletePending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-mute">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <p className="text-sm">{t('loadingDetail')}</p>
      </div>
    )
  }

  if (loadError || !subscription?.id || !subscription.organizationId) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/subscriptions"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('backToSubscriptions')}
        </Link>
        <p role="alert" className="text-sm text-negative">
          {loadError ?? t('errors.notFound')}
        </p>
      </div>
    )
  }

  const orgName =
    organization?.name ?? (subscription.organizationId.slice(0, 8) || t('errors.notFound'))
  const website = organization?.website?.trim() || null
  const plan = findPlanById(plans, subscription.planId)
  const amount = planAmountLabel(subscription.planId, plans, t('customPrice'))
  const billing =
    planBillingKind(subscription.planId, plans) === 'custom'
      ? t('billingCustom')
      : t('billingMonthly')
  const statusKey = SUBSCRIPTION_STATUSES.includes(
    subscription.status as SuperAdminSubscriptionStatus
  )
    ? (subscription.status as SuperAdminSubscriptionStatus)
    : null

  const tabs: { id: DetailTab; label: string; title?: string }[] = [
    { id: 'overview', label: t('detail.overview') },
    { id: 'usage', label: t('detail.usage'), title: t('detail.usageSoon') },
    { id: 'billing', label: t('detail.billingHistory'), title: t('exportSoon') },
  ]

  return (
    <div className="flex w-full flex-col gap-5">
      <Link
        href="/admin/subscriptions"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('backToSubscriptions')}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-pale text-sm font-semibold text-positive-deep">
            {getInitials(orgName) || 'OR'}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {orgName}
            </h1>
            <p className="mt-1 text-sm text-body">
              {t('detailPageTitle')} · {planLabel(subscription.planId, plans)}
            </p>
            {website ? <p className="mt-0.5 truncate text-sm text-mute">{website}</p> : null}
          </div>
        </div>
        <StatusBadge
          status={subscription.status}
          label={statusKey ? t(`statuses.${statusKey}`) : subscription.status}
        />
      </div>

      {actionMessage ? (
        <p
          role="status"
          className="rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep"
        >
          {actionMessage}
        </p>
      ) : null}

      <div className="flex gap-1 overflow-x-auto border-b border-dash-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            title={tab.title}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'shrink-0 cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors hover:text-ink',
              activeTab === tab.id
                ? 'border-primary text-positive-deep'
                : 'border-transparent text-mute'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
          <DashboardPanel as="section" className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t('detail.subscriptionDetails')}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <DetailItem label={t('columns.organization')} value={orgName} />
              <DetailItem label={t('columns.plan')} value={planLabel(subscription.planId, plans)} />
              <DetailItem
                label={t('columns.status')}
                value={
                  <StatusBadge
                    status={subscription.status}
                    label={statusKey ? t(`statuses.${statusKey}`) : subscription.status}
                  />
                }
              />
              <DetailItem label={t('columns.billing')} value={billing} />
              <DetailItem
                label={t('columns.amount')}
                value={plan?.price != null ? t('detail.amountPerMonth', { amount }) : amount}
              />
              <DetailItem
                label={t('columns.startedOn')}
                value={formatDisplayDate(subscription.currentPeriodStart)}
              />
              <DetailItem
                label={t('columns.nextBilling')}
                value={formatDisplayDate(subscription.currentPeriodEnd)}
              />
              <DetailItem label={t('detail.paymentMethod')} value={t('detail.paymentSoon')} />
            </dl>
          </DashboardPanel>

          <div className="flex flex-col gap-5">
            <DashboardPanel as="section" className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">{t('detail.usageTitle')}</h2>
                <span className="text-xs text-mute">{t('detail.viewAnalytics')}</span>
              </div>
              <p className="mt-1 text-xs text-mute">{t('detail.usageSoon')}</p>
              <div className="mt-4 space-y-3">
                <LimitRow
                  label={t('limits.users')}
                  limit={plan?.limits?.users}
                  unlimited={t('unlimited')}
                />
                <LimitRow
                  label={t('limits.messages')}
                  limit={plan?.limits?.messagesPerMonth}
                  unlimited={t('unlimited')}
                />
              </div>
            </DashboardPanel>

            <DashboardPanel as="section" className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink">{t('detail.quickActions')}</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Button type="button" className={quickActionClassName} onClick={openEdit}>
                  <RefreshCw className="size-4 shrink-0 text-mute" aria-hidden />
                  {t('actions.changePlan')}
                </Button>
                <Button
                  type="button"
                  className={cn(quickActionClassName, 'disabled:opacity-50')}
                  disabled
                  title={t('actions.pauseSoon')}
                >
                  <Pause className="size-4 shrink-0 text-mute" aria-hidden />
                  {t('actions.pause')}
                </Button>
                <div className="my-0.5 border-t border-dash-border" aria-hidden />
                <Button
                  type="button"
                  className={cn(
                    quickActionClassName,
                    'border-negative/30 text-negative hover:bg-negative/5 hover:text-negative'
                  )}
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteOpen(true)
                  }}
                >
                  <Trash2 className="size-4 shrink-0" aria-hidden />
                  {t('actions.cancelSubscription')}
                </Button>
                <Link
                  href={`/admin/organizations/${subscription.organizationId}`}
                  className={quickActionClassName}
                >
                  <Building2 className="size-4 shrink-0 text-mute" aria-hidden />
                  {t('actions.viewOrg')}
                  <ExternalLink className="ml-auto size-3.5 shrink-0 text-mute" aria-hidden />
                </Link>
              </div>
            </DashboardPanel>
          </div>
        </div>
      ) : null}

      {activeTab === 'usage' ? (
        <DashboardPanel as="section" className="p-5 text-sm text-body">
          <p>{t('detail.usageSoon')}</p>
        </DashboardPanel>
      ) : null}

      {activeTab === 'billing' ? (
        <DashboardPanel as="section" className="p-5 text-sm text-body">
          <p>{t('exportSoon')}</p>
        </DashboardPanel>
      ) : null}

      {editOpen && editForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!editPending) {
              setEditOpen(false)
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
            <p className="mt-1 text-sm text-body">{t('editSubtitle', { name: orgName })}</p>
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sub-detail-plan" className="text-sm font-medium text-ink">
                  {t('fields.planId')}
                </label>
                <select
                  id="sub-detail-plan"
                  value={editForm.planId}
                  disabled={editPending}
                  onChange={(e) => setEditForm({ ...editForm, planId: e.target.value })}
                  className={selectClassName}
                >
                  {planOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.status !== 'active' ? ` (${option.status})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sub-detail-status" className="text-sm font-medium text-ink">
                  {t('fields.status')}
                </label>
                <select
                  id="sub-detail-status"
                  value={editForm.status}
                  disabled={editPending}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value as SuperAdminSubscriptionStatus,
                    })
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
                  <label htmlFor="sub-detail-start" className="text-sm font-medium text-ink">
                    {t('fields.startDate')}
                  </label>
                  <Input
                    id="sub-detail-start"
                    type="date"
                    value={editForm.startDate}
                    disabled={editPending}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="h-11 rounded-xl border-dash-border"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sub-detail-end" className="text-sm font-medium text-ink">
                    {t('fields.endDate')}
                  </label>
                  <Input
                    id="sub-detail-end"
                    type="date"
                    value={editForm.endDate}
                    disabled={editPending}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="h-11 rounded-xl border-dash-border"
                  />
                </div>
              </div>
            </div>
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
                  setEditOpen(false)
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
                {editPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {editPending ? t('saving') : t('editSave')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!deletePending) setDeleteOpen(false)
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
              {t('deleteConfirmBody', { name: orgName })}
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
                onClick={() => setDeleteOpen(false)}
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
                {deletePending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {deletePending ? t('deleting') : t('deleteConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dash-border/70 bg-dash-surface/40 px-3 py-2.5">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}
