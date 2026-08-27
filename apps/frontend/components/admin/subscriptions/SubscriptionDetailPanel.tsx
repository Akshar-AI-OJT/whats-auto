'use client'

import { Pause, RefreshCw, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AdminOrganizationListItem } from '@/components/admin/organizations/organization-api'
import type {
  SuperAdminPlan,
  SuperAdminSubscription,
  SuperAdminSubscriptionStatus,
} from '@/lib/api'
import {
  findPlanById,
  planAmountLabel,
  planBillingKind,
  planLabel,
  SUBSCRIPTION_STATUSES,
} from './subscription-api'

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

type SubscriptionDetailPanelProps = {
  subscription: SuperAdminSubscription
  plans: SuperAdminPlan[]
  organization?: AdminOrganizationListItem
  onClose: () => void
  onChangePlan: () => void
  onCancelSubscription: () => void
}

export function SubscriptionDetailPanel({
  subscription,
  plans,
  organization,
  onClose,
  onChangePlan,
  onCancelSubscription,
}: SubscriptionDetailPanelProps) {
  const t = useTranslations('admin.subscriptions')
  const name = organization?.name ?? subscription.organizationId.slice(0, 8)
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

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-dash-border bg-canvas xl:w-[380px] xl:shrink-0">
      <div className="flex items-start justify-between gap-3 border-b border-dash-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-pale text-sm font-semibold text-positive-deep">
            {getInitials(name) || 'OR'}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{name}</p>
            {website ? <p className="truncate text-xs text-mute">{website}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={subscription.status}
            label={statusKey ? t(`statuses.${statusKey}`) : subscription.status}
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
            aria-label={t('cancel')}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-dash-border px-4 text-sm">
        <span className="border-b-2 border-primary py-2.5 font-semibold text-positive-deep">
          {t('detail.overview')}
        </span>
        <span className="py-2.5 text-mute" title={t('detail.usageSoon')}>
          {t('detail.usage')}
        </span>
        <span className="py-2.5 text-mute" title={t('exportSoon')}>
          {t('detail.billingHistory')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h3 className="text-sm font-semibold text-ink">{t('detail.subscriptionDetails')}</h3>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.plan')}</dt>
            <dd className="font-medium text-ink">{planLabel(subscription.planId, plans)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.billing')}</dt>
            <dd className="font-medium text-ink">{billing}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.amount')}</dt>
            <dd className="font-medium tabular-nums text-ink">
              {plan?.price != null ? t('detail.amountPerMonth', { amount }) : amount}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.status')}</dt>
            <dd>
              <StatusBadge
                status={subscription.status}
                label={statusKey ? t(`statuses.${statusKey}`) : subscription.status}
              />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.startedOn')}</dt>
            <dd className="tabular-nums text-ink">
              {formatDisplayDate(subscription.currentPeriodStart)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('columns.nextBilling')}</dt>
            <dd className="tabular-nums text-ink">
              {formatDisplayDate(subscription.currentPeriodEnd)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-mute">{t('detail.paymentMethod')}</dt>
            <dd className="text-right text-xs text-mute">{t('detail.paymentSoon')}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">{t('detail.usageTitle')}</h3>
            <span className="text-xs text-mute">{t('detail.viewAnalytics')}</span>
          </div>
          <p className="mt-1 text-xs text-mute">{t('detail.usageSoon')}</p>
          <div className="mt-3 space-y-3">
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
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">{t('detail.quickActions')}</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={onChangePlan}>
              <RefreshCw className="size-4" aria-hidden />
              {t('actions.changePlan')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              disabled
              title={t('actions.pauseSoon')}
            >
              <Pause className="size-4" aria-hidden />
              {t('actions.pause')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2 border-negative/40 text-negative hover:bg-negative/5"
              onClick={onCancelSubscription}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('actions.delete')}
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-dash-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-mute uppercase">
            {t('detail.goToOrg')}
          </p>
          <Link
            href={`/admin/organizations/${subscription.organizationId}`}
            className="mt-1 inline-flex text-sm font-medium text-positive-deep hover:underline"
          >
            {t('actions.viewOrg')}
          </Link>
        </div>
      </div>
    </aside>
  )
}
