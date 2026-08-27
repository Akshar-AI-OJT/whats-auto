'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Crown,
  LayoutGrid,
  Loader2,
  MessageSquareText,
  Users,
} from 'lucide-react'
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

function plansGridClass(count: number) {
  if (count <= 1) return 'md:grid-cols-1 lg:grid-cols-1'
  if (count === 2) return 'md:grid-cols-2 lg:grid-cols-2'
  return 'md:grid-cols-2 lg:grid-cols-3'
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

  const sharedFeatures = useMemo(() => {
    if (plans.length === 0) return []
    const [first, ...rest] = plans
    return first.features
      .filter((feature) => feature.enabled)
      .filter((feature) =>
        rest.every((plan) =>
          plan.features.some((candidate) => candidate.key === feature.key && candidate.enabled)
        )
      )
      .slice(0, 4)
  }, [plans])

  const selected =
    selectedPlanId && plans.length > 0 ? plans.find((p) => p.id === selectedPlanId) ?? null : null

  const perMonth = tSubs('perMonth')
  const unlimited = tSubs('unlimited')
  const popular = tSubs('popular')
  const customPrice = tSubs('customPrice')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {t('step4.title')}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-pretty text-body">{t('step4.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="mt-2 flex items-center justify-center gap-2 py-12 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('step4.loadingPlans')}
        </div>
      ) : isError ? (
        <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-negative/25 bg-negative/5 px-6 py-12 text-center">
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
        <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dash-border bg-dash-surface/30 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">{t('step4.emptyTitle')}</p>
          <p className="max-w-md text-sm text-mute">{t('step4.emptyDescription')}</p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'grid auto-rows-fr grid-cols-1 items-stretch gap-4 sm:gap-5',
              plansGridClass(plans.length)
            )}
          >
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id
              const checkoutable = plan.checkoutable
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
                    'group relative flex h-full min-h-0 flex-col rounded-2xl p-5 text-left sm:p-6',
                    'border bg-canvas transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out',
                    isSelected
                      ? 'border-primary bg-primary/[0.03] shadow-[0_0_0_1px_rgb(37_99_235/0.35),0_12px_28px_rgb(37_99_235/0.08)]'
                      : 'border-[#E2E8F0] shadow-[0_1px_2px_rgb(15_23_42/0.04)] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_10px_24px_rgb(15_23_42/0.06)]'
                  )}
                >
                  {plan.popular ? (
                    <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold tracking-wide text-on-primary shadow-sm">
                      {popular}
                    </span>
                  ) : null}

                  {isSelected ? (
                    <span className="absolute top-4 right-4 flex size-6 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                      <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                    </span>
                  ) : null}

                  <div className="min-w-0 pr-8">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                      {plan.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 min-h-[2.75rem] break-words text-sm leading-5 text-mute">
                      {plan.description ?? ''}
                    </p>
                  </div>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums sm:text-[2.15rem]">
                      {priceLabel}
                    </span>
                    {plan.price != null ? <span className="text-sm text-mute">{perMonth}</span> : null}
                  </div>

                  <div className="mt-5 border-t border-[#E2E8F0] pt-4">
                    <ul className="flex flex-col gap-2.5">
                      <li className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 text-mute">
                          <Users className="size-4 shrink-0 text-primary" aria-hidden />
                          {tSubs('limits.users')}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">{users}</span>
                      </li>
                      <li className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 text-mute">
                          <MessageSquareText className="size-4 shrink-0 text-primary" aria-hidden />
                          {tSubs('limits.messages')}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">{messages}</span>
                      </li>
                      <li className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 text-mute">
                          <LayoutGrid className="size-4 shrink-0 text-primary" aria-hidden />
                          {tSubs('limits.workspaces')}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">{workspaces}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-5 flex min-h-0 flex-1 flex-col">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-mute uppercase">
                      {tSubs('featuresLabel')}
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {enabledFeatures.map((f) => (
                        <li key={f.key} className="flex items-start gap-2.5 text-sm leading-5 text-body">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-pale text-primary">
                            <Check className="size-3 stroke-[2.5]" aria-hidden />
                          </span>
                          <span>{resolvePlanFeatureLabel(tFeatures, f.key, f.name)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6">
                    {!checkoutable ? (
                      <div className="flex h-11 items-center justify-center rounded-xl border border-dash-border bg-[#F8FAFC] px-3 text-sm font-semibold text-positive-deep">
                        {t('step4.enterpriseCta')}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'flex h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors duration-200',
                          isSelected
                            ? 'bg-primary text-on-primary shadow-[0_8px_18px_rgb(37_99_235/0.28)]'
                            : 'border border-primary/40 bg-canvas text-primary group-hover:border-primary group-hover:bg-primary-pale/50'
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

          {sharedFeatures.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-pale text-primary">
                  <Crown className="size-4" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-ink">{t('step4.allPlansInclude')}</p>
              </div>
              <ul className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                {sharedFeatures.map((feature) => (
                  <li key={feature.key} className="inline-flex items-center gap-1.5 text-sm text-body">
                    <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{resolvePlanFeatureLabel(tFeatures, feature.key, feature.name)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selected ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] px-4 py-3.5 sm:px-5">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-positive-deep uppercase">
                {t('step4.summaryLabel')}
              </p>
              <p className="mt-1.5 text-sm text-ink">
                <span className="font-semibold">{selected.name}</span>
                {' — '}
                {selected.price == null
                  ? t('step4.enterpriseCustomPrice')
                  : `${formatTenantPlanPrice(selected.price, selected.currency, customPrice)} ${perMonth}`}
              </p>
              <p className="mt-1 text-xs text-mute">{t('step4.summaryNote')}</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
