'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowLeft, Check, FileEdit, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { queryKeys } from '@/lib/query-keys'
import {
  ADMIN_PLAN_FEATURE_I18N_NS,
  resolvePlanFeatureLabel,
} from '@/lib/plan-feature-labels'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { PlanStatusBadge } from './PlanStatusBadge'
import { archivePlan, getPlan } from './plan-service'
import {
  billingPeriodLabel,
  enabledFeatureCount,
  formatLimit,
  formatPlanDate,
  formatPlanPrice,
} from './plan-utils'
import { PLAN_FEATURE_CATALOG } from './plan-feature-catalog'
import type { PlanFeatureCategoryId, SubscriptionPlan } from './types'

const CATEGORIES: PlanFeatureCategoryId[] = [
  'messaging',
  'automation',
  'ai',
  'team',
  'integrations',
]

type PlanViewPageProps = {
  planId: string
}

export function PlanViewPage({ planId }: PlanViewPageProps) {
  const t = useTranslations('admin.plans')
  const tFeatures = useTranslations(ADMIN_PLAN_FEATURE_I18N_NS)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archivePending, setArchivePending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const planQuery = useQuery({
    queryKey: queryKeys.admin.planDetail(planId),
    queryFn: async () => {
      const result = await getPlan(planId)
      if (!result) throw new Error('not_found')
      return result
    },
    staleTime: 60_000,
  })

  const plan = planQuery.data ?? null
  const loading = planQuery.isLoading
  const error =
    actionError ||
    (planQuery.isError
      ? planQuery.error instanceof Error && planQuery.error.message === 'not_found'
        ? t('errors.notFound')
        : t('errors.loadFailed')
      : null)

  const periodLabels = useMemo(
    () => ({
      monthly: t('billing.monthly'),
      yearly: t('billing.yearly'),
      custom: t('billing.custom'),
    }),
    [t]
  )

  async function handleArchive() {
    if (!plan) return
    setArchivePending(true)
    setActionError(null)
    try {
      const result = await archivePlan(plan.id)
      if (!result.ok) {
        setActionError(t(result.messageKey))
        return
      }
      queryClient.setQueryData<SubscriptionPlan>(queryKeys.admin.planDetail(planId), result.plan)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.plansRoot })
      setArchiveOpen(false)
      setActionMessage(t('toast.archived'))
    } finally {
      setArchivePending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-mute">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/plans"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('backToPlans')}
        </Link>
        <p role="alert" className="text-sm text-negative">
          {error ?? t('errors.notFound')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/plans"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
          >
            <ArrowLeft className="size-4" />
            {t('backToPlans')}
          </Link>
          <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('eyebrow')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {plan.name}
            </h1>
            <PlanStatusBadge status={plan.status} label={t(`statuses.${plan.status}`)} />
            {plan.popular ? (
              <span className="rounded-md bg-primary-pale px-1.5 py-0.5 text-[10px] font-semibold text-positive-deep">
                {t('popular')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-body">{plan.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/admin/plans/${plan.id}/edit`)}
          >
            <FileEdit className="size-4" />
            {t('actions.edit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={plan.status === 'archived'}
            onClick={() => setArchiveOpen(true)}
          >
            <Archive className="size-4" />
            {t('actions.archive')}
          </Button>
        </div>
      </div>

      {actionMessage ? (
        <p
          role="status"
          className="rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep"
        >
          {actionMessage}
        </p>
      ) : null}

      <DashboardPanel className="p-5 sm:p-6 lg:p-8">
        <h2 className="font-display text-lg tracking-tight text-ink">{t('view.overview')}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('columns.price')}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {formatPlanPrice(plan, t('customPrice'), t('perMonth'), t('perYear'))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('fields.billingPeriod')}
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {billingPeriodLabel(plan.billingPeriod, periodLabels)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('fields.trialDays')}
            </dt>
            <dd className="mt-1 text-sm text-ink">{plan.trialDays ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('columns.features')}
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {t('featureCount', { count: enabledFeatureCount(plan) })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('columns.created')}
            </dt>
            <dd className="mt-1 text-sm tabular-nums text-ink">{formatPlanDate(plan.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('columns.updated')}
            </dt>
            <dd className="mt-1 text-sm tabular-nums text-ink">{formatPlanDate(plan.updatedAt)}</dd>
          </div>
        </dl>
      </DashboardPanel>

      <DashboardPanel className="p-5 sm:p-6 lg:p-8">
        <h2 className="font-display text-lg tracking-tight text-ink">{t('sections.limits')}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-mute">{t('fields.users')}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {formatLimit(plan.limits.users, t('unlimited'))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mute">{t('fields.messages')}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {formatLimit(plan.limits.messagesPerMonth, t('unlimited'))}
            </dd>
          </div>
        </dl>
      </DashboardPanel>

      <DashboardPanel className="p-5 sm:p-6 lg:p-8">
        <h2 className="font-display text-lg tracking-tight text-ink">{t('sections.features')}</h2>
        <div className="mt-4 flex flex-col gap-5">
          {CATEGORIES.map((category) => {
            const keys = PLAN_FEATURE_CATALOG.filter((item) => item.category === category).map(
              (item) => item.key
            )
            const features = plan.features.filter((feature) => keys.includes(feature.key))
            if (features.length === 0) return null
            return (
              <section key={category}>
                <h3 className="text-sm font-semibold text-ink">{t(`categories.${category}`)}</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {features.map((feature) => (
                    <li key={feature.key} className="flex items-start gap-2 text-sm">
                      {feature.enabled ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-positive-deep" />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-mute" />
                      )}
                      <span className={feature.enabled ? 'text-ink' : 'text-mute'}>
                        {resolvePlanFeatureLabel(
                          tFeatures,
                          feature.key,
                          feature.name,
                          ADMIN_PLAN_FEATURE_I18N_NS
                        )}
                        {feature.description ? (
                          <span className="mt-0.5 block text-xs text-mute">
                            {feature.description}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </DashboardPanel>

      {archiveOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!archivePending) setArchiveOpen(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg tracking-tight text-ink">{t('archiveTitle')}</h2>
            <p className="mt-2 text-sm text-body">{t('archiveBody', { name: plan.name })}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={archivePending}
                onClick={() => setArchiveOpen(false)}
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
