'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import {
  Activity,
  BarChart3,
  Building2,
  Building,
  CircleDollarSign,
  CreditCard,
  PauseCircle,
  Sparkles,
} from 'lucide-react'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { Button } from '@/components/ui/button'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { DashboardEmptyState } from '@/components/dashboard/overview/DashboardEmptyState'
import { ActivityItem, type ActivityTone } from '@/components/dashboard/overview/ActivityItem'
import {
  buildOrganizationGrowth,
  computeCurrentOrganizationSplit,
  computePlanDistribution,
  countOrganizationsByUiStatus,
  countTrialOrganizations,
  fetchAllOrganizations,
  fetchAllPlans,
  fetchAllSubscriptions,
  fetchCurrentMonthPaidRevenue,
  fetchInvoiceSummary,
  fetchRecentAudit,
  formatCurrency,
  type BreakdownItem,
  type GrowthPoint,
} from './super-admin-analytics'
import { queryKeys } from '@/lib/query-keys'

function PanelLoading({ label }: { label: string }) {
  return <div className="mt-5 flex min-h-44 items-center justify-center text-sm text-mute">{label}</div>
}

function PanelError({
  label,
  retryLabel,
  retry,
}: {
  label: string
  retryLabel: string
  retry: () => void
}) {
  return (
    <div className="mt-5 flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/40 px-6 py-12 text-center">
      <p className="text-sm text-body">{label}</p>
      <Button variant="outline" size="sm" onClick={retry}>
        {retryLabel}
      </Button>
    </div>
  )
}

function HorizontalBars({
  items,
  translateLabel,
  emptyLabel,
}: {
  items: BreakdownItem[]
  translateLabel: (key: string, label: string) => string
  emptyLabel: string
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total === 0 || items.length === 0) {
    return <p className="mt-5 text-sm text-mute">{emptyLabel}</p>
  }

  return (
    <ul className="mt-5 flex flex-col gap-3">
      {items.map((item) => {
        const pct = Math.round((item.value / total) * 100)
        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink">{translateLabel(item.key, item.label)}</span>
              <span className="shrink-0 tabular-nums text-mute">
                {item.value} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-dash-surface">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function GrowthBars({
  points,
  emptyLabel,
}: {
  points: GrowthPoint[]
  emptyLabel: string
}) {
  if (points.length === 0) return <p className="mt-5 text-sm text-mute">{emptyLabel}</p>
  const max = Math.max(...points.map((point) => point.cumulative), 0)

  return (
    <div className="mt-5 grid grid-cols-6 gap-3">
      {points.map((point) => {
        const height = max > 0 ? Math.max(12, Math.round((point.cumulative / max) * 120)) : 12
        return (
          <div key={point.key} className="flex min-w-0 flex-col items-center gap-2">
            <div className="text-xs tabular-nums text-mute">{point.cumulative}</div>
            <div className="flex h-32 w-full items-end justify-center rounded-2xl bg-dash-surface/60 px-1.5 py-2">
              <div className="w-full rounded-xl bg-primary/85" style={{ height }} />
            </div>
            <div className="truncate text-xs font-medium text-mute">{point.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-dash-border bg-dash-surface/40 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

export function PlatformAnalyticsPage() {
  const t = useTranslations('admin.analytics')
  const locale = useLocale()

  const orgQuery = useQuery({
    queryKey: queryKeys.admin.analytics.organizations,
    queryFn: fetchAllOrganizations,
    staleTime: 60_000,
  })

  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.admin.analytics.subscriptions,
    queryFn: fetchAllSubscriptions,
    staleTime: 60_000,
  })

  const plansQuery = useQuery({
    queryKey: queryKeys.admin.analytics.plans,
    queryFn: fetchAllPlans,
    staleTime: 60_000,
  })

  const invoiceSummaryQuery = useQuery({
    queryKey: queryKeys.admin.analytics.invoiceSummary,
    queryFn: () => fetchInvoiceSummary(),
    staleTime: 60_000,
  })

  const currentMonthPaidRevenueQuery = useQuery({
    queryKey: queryKeys.admin.analytics.currentMonthPaidRevenue,
    queryFn: fetchCurrentMonthPaidRevenue,
    staleTime: 60_000,
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.admin.analytics.audit,
    queryFn: fetchRecentAudit,
    staleTime: 60_000,
  })

  const organizations = useMemo(() => orgQuery.data?.items ?? [], [orgQuery.data?.items])
  const organizationsTotal = orgQuery.data?.total ?? organizations.length
  const subscriptions = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data])
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const invoiceSummary = invoiceSummaryQuery.data
  const audits = useMemo(() => auditQuery.data ?? [], [auditQuery.data])

  const orgCounts = useMemo(
    () => countOrganizationsByUiStatus(organizations),
    [organizations]
  )
  const activeCount = orgCounts.active
  const inactiveCount = orgCounts.suspended + orgCounts.pending
  const trialCount = useMemo(() => countTrialOrganizations(subscriptions), [subscriptions])
  const invoicePendingOverdue = useMemo(
    () => (invoiceSummary ? invoiceSummary.pendingCount + invoiceSummary.overdueCount : 0),
    [invoiceSummary]
  )

  const growthPoints = useMemo(
    () => buildOrganizationGrowth(organizations, locale, 6),
    [organizations, locale]
  )
  const activeSplit = useMemo(
    () => computeCurrentOrganizationSplit(organizations),
    [organizations]
  )
  const planDistribution = useMemo(
    () => computePlanDistribution(subscriptions, plans),
    [subscriptions, plans]
  )

  const auditItems = useMemo(
    () =>
      audits.map((event) => {
        const detail = [event.actorName || event.actorEmail, event.organizationName, event.reason]
          .filter(Boolean)
          .join(' - ')
        const tone: ActivityTone =
          event.granted === true ? 'green' : event.granted === false ? 'amber' : 'neutral'
        return {
          id: event.id,
          title: event.eventType,
          detail: detail || t('audit.noDetails'),
          createdAt: event.createdAt,
          tone,
        }
      }),
    [audits, t]
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 xl:gap-7">
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

      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <KPIStatCard
          label={t('kpis.totalOrganizations')}
          value={organizationsTotal}
          icon={Building2}
          loading={orgQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.activeOrganizations')}
          value={activeCount}
          icon={Building}
          loading={orgQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.inactiveOrganizations')}
          value={inactiveCount}
          icon={PauseCircle}
          loading={orgQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.trialOrganizations')}
          value={trialCount}
          icon={Sparkles}
          loading={subscriptionsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.thisMonthRevenue')}
          value={formatCurrency(
            currentMonthPaidRevenueQuery.data ?? 0,
            locale,
            invoiceSummary?.currency
          )}
          format="plain"
          icon={CircleDollarSign}
          loading={currentMonthPaidRevenueQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.paidRevenue')}
          value={formatCurrency(invoiceSummary?.paidAmount ?? 0, locale, invoiceSummary?.currency)}
          format="plain"
          icon={CreditCard}
          loading={invoiceSummaryQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.pendingOverdueInvoices')}
          value={invoicePendingOverdue}
          icon={CreditCard}
          loading={invoiceSummaryQuery.isLoading}
          className="h-full"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <DashboardPanel as="section" className="h-full p-4 sm:p-5 md:p-6">
            <DashboardSectionHeader
              title={t('sections.organizationGrowth.title')}
              description={t('sections.organizationGrowth.description')}
            />
            {orgQuery.isLoading ? (
              <PanelLoading label={t('loading.organizations')} />
            ) : orgQuery.isError ? (
              <PanelError
                label={t('errors.organizations')}
                retryLabel={t('retry')}
                retry={() => void orgQuery.refetch()}
              />
            ) : organizations.length === 0 ? (
              <DashboardEmptyState
                title={t('sections.organizationGrowth.emptyTitle')}
                description={t('sections.organizationGrowth.emptyDescription')}
                icon={<Building2 className="size-5" aria-hidden />}
              />
            ) : (
              <GrowthBars points={growthPoints} emptyLabel={t('sections.organizationGrowth.emptyChart')} />
            )}
          </DashboardPanel>
        </div>
        <div className="min-w-0 xl:col-span-5">
          <DashboardPanel as="section" className="h-full p-4 sm:p-5 md:p-6">
            <DashboardSectionHeader
              title={t('sections.activeInactive.title')}
              description={t('sections.activeInactive.description')}
            />
            {orgQuery.isLoading ? (
              <PanelLoading label={t('loading.organizations')} />
            ) : orgQuery.isError ? (
              <PanelError
                label={t('errors.organizations')}
                retryLabel={t('retry')}
                retry={() => void orgQuery.refetch()}
              />
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <SummaryTile label={t('sections.activeInactive.active')} value={String(activeCount)} />
                  <SummaryTile label={t('sections.activeInactive.inactive')} value={String(inactiveCount)} />
                </div>
                <HorizontalBars
                  items={activeSplit}
                  emptyLabel={t('sections.activeInactive.emptyChart')}
                  translateLabel={(key) => t(`labels.activeInactive.${key}`)}
                />
              </>
            )}
          </DashboardPanel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <DashboardPanel as="section" className="h-full p-4 sm:p-5 md:p-6">
            <DashboardSectionHeader
              title={t('sections.revenueSummary.title')}
              description={t('sections.revenueSummary.description')}
            />
            {invoiceSummaryQuery.isLoading ? (
              <PanelLoading label={t('loading.revenue')} />
            ) : invoiceSummaryQuery.isError ? (
              <PanelError
                label={t('errors.revenue')}
                retryLabel={t('retry')}
                retry={() => void invoiceSummaryQuery.refetch()}
              />
            ) : !invoiceSummary ? (
              <DashboardEmptyState
                title={t('sections.revenueSummary.emptyTitle')}
                description={t('sections.revenueSummary.emptyDescription')}
                icon={<CircleDollarSign className="size-5" aria-hidden />}
              />
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile
                  label={t('sections.revenueSummary.thisMonthAmount')}
                  value={formatCurrency(
                    invoiceSummary.thisMonthAmount,
                    locale,
                    invoiceSummary.currency
                  )}
                />
                <SummaryTile
                  label={t('sections.revenueSummary.paidAmount')}
                  value={formatCurrency(
                    invoiceSummary.paidAmount,
                    locale,
                    invoiceSummary.currency
                  )}
                />
                <SummaryTile
                  label={t('sections.revenueSummary.pendingOverdue')}
                  value={String(invoiceSummary.pendingCount + invoiceSummary.overdueCount)}
                />
              </div>
            )}
          </DashboardPanel>
        </div>
        <div className="min-w-0 xl:col-span-5">
          <DashboardPanel as="section" className="h-full p-4 sm:p-5 md:p-6">
            <DashboardSectionHeader
              title={t('sections.subscriptionMix.title')}
              description={t('sections.subscriptionMix.description')}
            />
            {subscriptionsQuery.isLoading || plansQuery.isLoading ? (
              <PanelLoading label={t('loading.subscriptions')} />
            ) : subscriptionsQuery.isError || plansQuery.isError ? (
              <PanelError
                label={t('errors.subscriptions')}
                retryLabel={t('retry')}
                retry={() => {
                  void subscriptionsQuery.refetch()
                  void plansQuery.refetch()
                }}
              />
            ) : planDistribution.length === 0 ? (
              <DashboardEmptyState
                title={t('sections.subscriptionMix.emptyTitle')}
                description={t('sections.subscriptionMix.emptyDescription')}
                icon={<BarChart3 className="size-5" aria-hidden />}
              />
            ) : (
              <HorizontalBars
                items={planDistribution}
                emptyLabel={t('sections.subscriptionMix.emptyChart')}
                translateLabel={(_key, label) => label}
              />
            )}
          </DashboardPanel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6">
        <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
          <DashboardSectionHeader
            title={t('audit.title')}
            description={t('audit.description')}
          />
          {auditQuery.isLoading ? (
            <PanelLoading label={t('loading.audit')} />
          ) : auditQuery.isError ? (
            <PanelError
              label={t('errors.audit')}
              retryLabel={t('retry')}
              retry={() => void auditQuery.refetch()}
            />
          ) : auditItems.length === 0 ? (
            <DashboardEmptyState
              title={t('audit.emptyTitle')}
              description={t('audit.emptyDescription')}
              icon={<Activity className="size-5" aria-hidden />}
            />
          ) : (
            <ol className="mt-6 flex flex-1 flex-col">
              {auditItems.map((item, index) => (
                <li key={item.id}>
                  <ActivityItem
                    id={item.id}
                    title={item.title}
                    detail={item.detail}
                    timestamp={item.createdAt}
                    tone={item.tone}
                    isLast={index === auditItems.length - 1}
                  />
                </li>
              ))}
            </ol>
          )}
        </DashboardPanel>
      </div>
    </div>
  )
}
