'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

import { api, type TenantBillingPlan } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import {
  formatTenantPlanPrice,
  resolvePlanFeatureLabel,
  unwrapBillingPlans,
} from '@/components/dashboard/billing/billing-utils'

export type OnboardingCheckoutablePlanSelection = {
  id: string
  name: string
  checkoutable: boolean
}

type SubscriptionPlanSelectionStepProps = {
  selectedPlanId: string | null
  pending: boolean
  onSelect: (selection: OnboardingCheckoutablePlanSelection) => void
}

function formatLimit(value: number | null, unlimitedLabel: string) {
  if (value == null) return unlimitedLabel
  return value.toLocaleString('en-US')
}

export function SubscriptionPlanSelectionStep({
  selectedPlanId,
  pending,
  onSelect,
}: SubscriptionPlanSelectionStepProps) {
  const t = useTranslations('onboarding.organization')
  const tFeatures = useTranslations('admin.subscriptions.features')
  const tSubs = useTranslations('admin.subscriptions')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.onboarding.plans,
    queryFn: async (): Promise<TenantBillingPlan[]> => {
      const { data } = await api.billing.listPlans()
      return unwrapBillingPlans(data)
    },
  })

  const plans = useMemo(() => {
    // Onboarding UI is monthly-centric. If only non-monthly plans exist, show empty state.
    return (data ?? []).filter((p) => p.billingPeriod === 'monthly')
  }, [data])

  const selected =
    selectedPlanId && plans.length > 0 ? plans.find((p) => p.id === selectedPlanId) ?? null : null

  const perMonth = tSubs('perMonth')
  const unlimited = tSubs('unlimited')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step4.title')}
        </h2>
        <p className="text-sm leading-6 text-pretty text-body">{t('step4.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="mt-2 flex items-center justify-center gap-2 py-10 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('step4.loadingPlans')}
        </div>
      ) : isError ? (
        <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-negative/25 bg-negative/5 px-6 py-10 text-center">
          <p className="text-sm text-negative">{t('step4.loadingPlansFailed')}</p>
          <button
            type="button"
            className="rounded-xl border border-dash-border bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition-[background-color,border-color] duration-200 hover:bg-dash-surface"
            onClick={() => void refetch()}
          >
            {t('step4.retry')}
          </button>
          {error instanceof Error ? <p className="text-xs text-mute">{error.message}</p> : null}
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dash-border bg-dash-surface/30 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">{t('step4.emptyTitle')}</p>
          <p className="max-w-md text-sm text-mute">{t('step4.emptyDescription')}</p>
        </div>
      ) : (
        <>
          {/* 1 column on mobile, 2x2 readable grid on desktop */}
          <div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id
              const checkoutable = plan.checkoutable
              const customPrice = tSubs('customPrice')
              const popular = tSubs('popular')

              const users = formatLimit(plan.limits.users, unlimited)
              const messages = formatLimit(plan.limits.messagesPerMonth, unlimited)
              const workspaces = formatLimit(plan.limits.workspaces, unlimited)

              const enabledFeatures = plan.features.filter((f) => f.enabled)
              const priceLabel = formatTenantPlanPrice(plan.price, plan.currency, customPrice)

              return (
                <button
                  key={plan.id}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    onSelect({
                      id: plan.id,
                      name: plan.name,
                      checkoutable,
                    })
                  }
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative flex flex-col rounded-2xl p-5 text-left sm:p-6',
                    'border bg-canvas/70 transition-[border-color,box-shadow,transform] duration-200 ease-out',
                    isSelected
                      ? 'border-primary/60 shadow-[0_0_0_1px_rgb(37_99_235/0.28)]'
                      : 'border-[#E2E8F0] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm'
                  )}
                >
                  {plan.popular ? (
                    <span className="absolute top-4 right-4 rounded-lg bg-primary-pale px-2 py-0.5 text-[11px] font-semibold text-positive-deep ring-1 ring-primary/30">
                      {popular}
                    </span>
                  ) : null}

                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                      {plan.name}
                    </h3>
                    <p className="mt-1.5 break-words text-sm leading-6 text-mute">
                      {plan.description ?? ''}
                    </p>
                  </div>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums sm:text-4xl">
                      {priceLabel}
                    </span>
                    {plan.price != null ? <span className="text-sm text-mute">{perMonth}</span> : null}
                  </div>

                  <dl className="mt-5 grid gap-2.5 rounded-2xl border border-dash-border bg-dash-surface/70 p-3.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <dt className="text-mute">{tSubs('limits.users')}</dt>
                      <dd className="font-semibold tabular-nums text-ink">{users}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <dt className="text-mute">{tSubs('limits.messages')}</dt>
                      <dd className="font-semibold tabular-nums text-ink">{messages}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <dt className="text-mute">{tSubs('limits.workspaces')}</dt>
                      <dd className="font-semibold tabular-nums text-ink">{workspaces}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex min-h-0 flex-1 flex-col">
                    <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                      {tSubs('featuresLabel')}
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {enabledFeatures.map((f) => (
                        <li key={f.key} className="flex items-start gap-2.5 text-sm text-body">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary-pale text-positive-deep">
                            ✓
                          </span>
                          <span>{resolvePlanFeatureLabel(tFeatures, f.key, f.name)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4">
                    {!checkoutable ? (
                      <div className="flex items-center justify-center rounded-xl border border-dash-border bg-canvas/50 px-3 py-2 text-sm font-medium text-ink">
                        <span className="text-positive-deep">{t('step4.enterpriseCta')}</span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium',
                          isSelected
                            ? 'border-primary/40 bg-primary-pale text-positive-deep'
                            : 'border-dash-border bg-canvas text-ink'
                        )}
                      >
                        {isSelected ? t('step4.selectedCta') : t('step4.chooseCta')}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-dash-border bg-dash-surface/30 p-4">
              <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
                {t('step4.summaryLabel')}
              </p>
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">{selected.name}</span>
                {' - '}
                {selected.price == null
                  ? t('step4.enterpriseCustomPrice')
                  : `${formatTenantPlanPrice(selected.price, selected.currency, tSubs('customPrice'))} ${perMonth}`}
              </p>
              <p className="mt-1 text-xs text-mute">{t('step4.summaryNote')}</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
