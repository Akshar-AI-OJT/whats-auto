'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Eye,
  FileEdit,
  Layers,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { PlanStatusBadge } from './PlanStatusBadge'
import { archivePlan, listPlans } from './plan-service'
import {
  billingPeriodLabel,
  enabledFeatureCount,
  formatLimit,
  formatPlanDate,
  formatPlanPrice,
} from './plan-utils'
import type { PlanStatus, SubscriptionPlan } from './types'
import { PLAN_STATUSES } from './types'

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type StatusFilter = PlanStatus | 'all'

export function PlansPage() {
  const t = useTranslations('admin.plans')
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const searchId = useId()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<SubscriptionPlan | null>(null)
  const [archivePending, setArchivePending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(
    searchParams.get('created') === '1'
      ? t('toast.created')
      : searchParams.get('updated') === '1'
        ? t('toast.updated')
        : null
  )
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const plansQueryKey = queryKeys.admin.plans({
    search: debouncedSearch,
    status: statusFilter,
  })
  const plansQuery = useQuery({
    queryKey: plansQueryKey,
    queryFn: async () =>
      listPlans({
        search: debouncedSearch,
        status: statusFilter,
      }),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const items = plansQuery.data?.items ?? []
  const summary = plansQuery.data?.summary ?? null
  const loading = plansQuery.isLoading
  const error = plansQuery.error ? t('errors.loadFailed') : null

  useEffect(() => {
    function onDocClick() {
      setMenuId(null)
    }
    if (menuId) {
      document.addEventListener('click', onDocClick)
      return () => document.removeEventListener('click', onDocClick)
    }
  }, [menuId])

  const hasFilters = Boolean(debouncedSearch.trim()) || statusFilter !== 'all'

  const periodLabels = useMemo(
    () => ({
      monthly: t('billing.monthly'),
      yearly: t('billing.yearly'),
      custom: t('billing.custom'),
    }),
    [t]
  )

  async function handleArchive() {
    if (!archiveTarget) return
    setArchivePending(true)
    setActionError(null)
    try {
      const result = await archivePlan(archiveTarget.id)
      if (!result.ok) {
        setActionError(t(result.messageKey))
        return
      }
      setActionMessage(t('toast.archived'))
      setArchiveTarget(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.plansRoot })
    } finally {
      setArchivePending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('eyebrow')}</p>
          <h1 className="mt-1 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          className="gap-2 self-start"
          onClick={() => router.push('/admin/plans/create')}
        >
          <Plus className="size-4" aria-hidden />
          {t('create')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPIStatCard
          label={t('kpis.total')}
          value={summary?.total ?? 0}
          format="number"
          icon={Layers}
          hint={t('kpis.catalog')}
          loading={loading && !summary}
        />
        <KPIStatCard
          label={t('kpis.active')}
          value={summary?.active ?? 0}
          format="number"
          icon={Sparkles}
          hint={t('kpis.published')}
          loading={loading && !summary}
        />
        <KPIStatCard
          label={t('kpis.draft')}
          value={summary?.draft ?? 0}
          format="number"
          icon={FileEdit}
          hint={t('kpis.unpublished')}
          loading={loading && !summary}
        />
        <KPIStatCard
          label={t('kpis.popular')}
          value={summary?.popularName ?? '—'}
          format="plain"
          icon={Star}
          hint={t('kpis.mostChosen')}
          loading={loading && !summary}
        />
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-lg tracking-tight text-ink">{t('tableTitle')}</h2>
            <p className="text-sm text-mute">{t('tableDescription', { count: items.length })}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-72">
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
              className={cn(selectClassName, 'sm:w-44')}
              aria-label={t('filterStatus')}
            >
              <option value="all">{t('filterAllStatuses')}</option>
              {PLAN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </div>
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
        {error ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void plansQuery.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 py-16 text-mute">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">{t('loading')}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <div className="min-w-[980px] overflow-hidden rounded-2xl border border-dash-border">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-dash-surface/80">
                    <tr className="border-b border-dash-border text-xs tracking-wide text-mute uppercase">
                      <th className="px-4 py-3 font-semibold">{t('columns.plan')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.price')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.limits')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.features')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.status')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.updated')}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-mute">
                          {hasFilters ? t('noMatches') : t('empty')}
                        </td>
                      </tr>
                    ) : (
                      items.map((plan) => (
                        <tr
                          key={plan.id}
                          className="border-b border-dash-border/80 last:border-b-0 hover:bg-dash-surface/40"
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => router.push(`/admin/plans/${plan.id}`)}
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-semibold text-ink">{plan.name}</span>
                                {plan.popular ? (
                                  <span className="rounded-md bg-primary-pale px-1.5 py-0.5 text-[10px] font-semibold text-positive-deep">
                                    {t('popular')}
                                  </span>
                                ) : null}
                              </span>
                              <p className="mt-0.5 max-w-xs truncate text-xs text-mute">
                                {plan.description}
                              </p>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold tabular-nums text-ink">
                              {formatPlanPrice(plan, t('customPrice'), t('perMonth'), t('perYear'))}
                            </p>
                            <p className="text-xs text-mute">
                              {billingPeriodLabel(plan.billingPeriod, periodLabels)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs leading-5 text-body">
                            <p>
                              {t('limits.users')}: {formatLimit(plan.limits.users, t('unlimited'))}
                            </p>
                            <p>
                              {t('limits.messages')}:{' '}
                              {formatLimit(plan.limits.messagesPerMonth, t('unlimited'))}
                            </p>
                            <p>
                              {t('limits.workspaces')}:{' '}
                              {formatLimit(plan.limits.workspaces, t('unlimited'))}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums text-ink">
                            {t('featureCount', { count: enabledFeatureCount(plan) })}
                          </td>
                          <td className="px-4 py-3">
                            <PlanStatusBadge
                              status={plan.status}
                              label={t(`statuses.${plan.status}`)}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums text-body">
                            {formatPlanDate(plan.updatedAt)}
                          </td>
                          <td className="relative px-4 py-3 text-right">
                            <button
                              type="button"
                              className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                              aria-label={t('actions.openMenu')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuId((id) => (id === plan.id ? null : plan.id))
                              }}
                            >
                              <MoreVertical className="size-4" />
                            </button>
                            {menuId === plan.id ? (
                              <div
                                className="absolute right-4 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-lg"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
                                  onClick={() => router.push(`/admin/plans/${plan.id}`)}
                                >
                                  <Eye className="size-3.5" />
                                  {t('actions.view')}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
                                  onClick={() => router.push(`/admin/plans/${plan.id}/edit`)}
                                >
                                  <FileEdit className="size-3.5" />
                                  {t('actions.edit')}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-negative hover:bg-negative/5 disabled:opacity-50"
                                  disabled={plan.status === 'archived'}
                                  onClick={() => {
                                    setMenuId(null)
                                    setArchiveTarget(plan)
                                  }}
                                >
                                  <Archive className="size-3.5" />
                                  {t('actions.archive')}
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-3 md:hidden">
              {items.length === 0 ? (
                <li className="rounded-2xl border border-dash-border px-4 py-10 text-center text-sm text-mute">
                  {hasFilters ? t('noMatches') : t('empty')}
                </li>
              ) : (
                items.map((plan) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-dash-border bg-dash-surface/60 p-4 text-left"
                      onClick={() => router.push(`/admin/plans/${plan.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{plan.name}</p>
                          <p className="mt-1 text-sm text-body">
                            {formatPlanPrice(plan, t('customPrice'), t('perMonth'), t('perYear'))}
                          </p>
                        </div>
                        <PlanStatusBadge
                          status={plan.status}
                          label={t(`statuses.${plan.status}`)}
                        />
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </DashboardPanel>

      {archiveTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!archivePending) setArchiveTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg tracking-tight text-ink">{t('archiveTitle')}</h2>
            <p className="mt-2 text-sm text-body">
              {t('archiveBody', { name: archiveTarget.name })}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={archivePending}
                onClick={() => setArchiveTarget(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                disabled={archivePending}
                className="gap-2"
                onClick={() => void handleArchive()}
              >
                {archivePending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('archiveConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
