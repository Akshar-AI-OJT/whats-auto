'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Check, CreditCard, ExternalLink, Loader2, Minus, RefreshCw } from 'lucide-react'
import { api, type ApiError, type BillingSubscription } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { cn } from '@/lib/utils'
import { BillingCheckoutDialog } from './BillingCheckoutDialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PLANS, isPlanId, type PlanId, planKeyFromCheckoutPlanId } from '@/lib/plan-config'
import {
  billingQueryKeys,
  billingStatusTone,
  formatBillingDate,
  isSubscriptionNotFound,
  unwrapBillingCheckout,
  unwrapBillingSubscription,
} from './billing-utils'
import { clearPendingWorkspacePlan, readPendingWorkspacePlan } from '@/lib/onboarding'

function readPlanIdFromQuery(): string {
  if (typeof window === 'undefined') return ''
  try {
    return new URLSearchParams(window.location.search).get('planId')?.trim() ?? ''
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('dashboard.billing.status')
  const key = status.toLowerCase()
  const label =
    key === 'active'
      ? t('active')
      : key === 'trialing'
        ? t('trialing')
        : key === 'past_due'
          ? t('pastDue')
          : key === 'cancelled' || key === 'canceled'
            ? t('cancelled')
            : status

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        billingStatusTone(status)
      )}
    >
      {label}
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-sm font-medium break-all text-ink sm:text-right">{value}</dd>
    </div>
  )
}

export function BillingPage() {
  const t = useTranslations('dashboard.billing')
  const tPlans = useTranslations('admin.subscriptions.plans')
  const tFeatures = useTranslations('admin.subscriptions.features')
  const tSubs = useTranslations('admin.subscriptions')
  const tCompare = useTranslations('pricingPage.comparison')
  const tCompareValues = useTranslations('pricingPage.comparison.values')
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canViewBilling,
    canManageBilling,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null)
  const [queryPlanId, setQueryPlanId] = useState('')

  useEffect(() => {
    setQueryPlanId(readPlanIdFromQuery())
  }, [])

  const subscriptionQuery = useQuery({
    queryKey: billingQueryKeys.subscription(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canViewBilling && !orgsLoading,
    queryFn: async (): Promise<BillingSubscription | null> => {
      try {
        const { data } = await api.billing.getSubscription()
        return unwrapBillingSubscription(data)
      } catch (error) {
        if (isSubscriptionNotFound(error)) return null
        throw error
      }
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { data } = await api.billing.checkout({ planId })
      const result = unwrapBillingCheckout(data)
      if (!result) throw new Error(t('errors.checkoutFailed'))
      return result
    },
    onSuccess: async (result) => {
      setCheckoutError(null)
      setCheckoutOpen(false)
      setCheckoutSuccess(t('checkout.success'))
      await queryClient.invalidateQueries({ queryKey: billingQueryKeys.all })
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
      }
    },
    onError: (err) => {
      const apiError = err as unknown as ApiError
      setCheckoutError(apiError.message || t('errors.checkoutFailed'))
    },
  })

  const subscription = subscriptionQuery.data ?? null
  const initialCheckoutPlanId = queryPlanId || subscription?.planId || ''

  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanId | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmPlanKey, setConfirmPlanKey] = useState<PlanId | null>(null)

  const currentPlanKey = planKeyFromCheckoutPlanId(subscription?.planId ?? null)

  useEffect(() => {
    // Prefer any plan selected during onboarding so the UI feels continuous.
    const pending = readPendingWorkspacePlan()
    if (isPlanId(pending)) {
      setSelectedPlanKey(pending)
    } else {
      setSelectedPlanKey(currentPlanKey)
    }
    // Clear after we've consumed it once; UI-only.
    clearPendingWorkspacePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedPlanKey) setSelectedPlanKey(currentPlanKey)
  }, [currentPlanKey, selectedPlanKey])

  const compareFeatureKeys = Array.from(new Set(PLANS.flatMap((p) => p.featureKeys))).filter(
    Boolean
  )

  if (!orgsLoading && !canViewBilling) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <div
            role="alert"
            className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            {t('errors.permissionDenied')}
          </div>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={subscriptionQuery.isFetching}
              onClick={() => subscriptionQuery.refetch()}
            >
              <RefreshCw
                className={cn('size-4', subscriptionQuery.isFetching && 'animate-spin')}
                aria-hidden
              />
              {t('refresh')}
            </Button>
            {canManageBilling ? (
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  setCheckoutError(null)
                  setCheckoutSuccess(null)
                  setCheckoutOpen(true)
                }}
              >
                <CreditCard className="size-4" aria-hidden />
                {subscription ? t('upgradeCta') : t('choosePlanCta')}
              </Button>
            ) : null}
          </div>
        </div>

        {checkoutSuccess ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-primary/25 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep"
          >
            {checkoutSuccess}
          </div>
        ) : null}
      </DashboardPanel>

      <div className="grid grid-cols-1 gap-8">
          <DashboardPanel as="section" className="p-5 sm:p-6 md:p-7">
            <DashboardSectionHeader
              title={t('subscriptionTitle')}
              description={t('subscriptionDescription')}
            />

            {subscriptionQuery.isLoading || orgsLoading ? (
              <div className="mt-10 flex items-center justify-center gap-2 py-20 text-sm text-body">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('loading')}
              </div>
            ) : subscriptionQuery.isError ? (
              <div
                role="alert"
                className="mt-10 rounded-xl border border-negative/25 bg-negative/5 px-5 py-4 text-sm text-negative"
              >
                {(subscriptionQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
              </div>
            ) : !subscription ? (
              <div className="mt-10 flex flex-col items-center justify-center gap-6">
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-8 py-20 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
                    <CreditCard className="size-6" aria-hidden />
                  </span>
                  <p className="font-medium text-ink">{t('emptyTitle')}</p>
                  <p className="max-w-md text-sm text-body">{t('emptyDescription')}</p>
                  {canManageBilling ? (
                    <Button
                      type="button"
                      className="mt-2 gap-2"
                      onClick={() => {
                        setCheckoutError(null)
                        setCheckoutSuccess(null)
                        setCheckoutOpen(true)
                      }}
                    >
                      <CreditCard className="size-4" aria-hidden />
                      {t('choosePlanCta')}
                    </Button>
                  ) : null}
                </div>

                <div className="w-full rounded-2xl border border-dash-border bg-dash-surface/50 px-6 py-14 text-center text-sm text-mute">
                  {t('emptyDescription')}
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={subscription.status} />
                  {subscription.cancelAtPeriodEnd ? (
                    <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-ink">
                      {t('cancelAtPeriodEnd')}
                    </span>
                  ) : null}
                </div>

                <dl className="space-y-3 rounded-2xl border border-dash-border bg-dash-surface/30 p-5">
                  <DetailRow label={t('fields.planId')} value={subscription.planId} />
                  <DetailRow
                    label={t('fields.status')}
                    value={<StatusBadge status={subscription.status} />}
                  />
                  <DetailRow
                    label={t('fields.currentPeriodStart')}
                    value={formatBillingDate(subscription.currentPeriodStart)}
                  />
                  <DetailRow
                    label={t('fields.currentPeriodEnd')}
                    value={formatBillingDate(subscription.currentPeriodEnd)}
                  />
                  <DetailRow
                    label={t('fields.trialEndsAt')}
                    value={formatBillingDate(subscription.trialEndsAt)}
                  />
                  <DetailRow label={t('fields.gateway')} value={subscription.gateway} />
                  <DetailRow
                    label={t('fields.gatewaySubscriptionId')}
                    value={subscription.gatewaySubscriptionId}
                  />
                  <DetailRow
                    label={t('fields.lastPaymentStatus')}
                    value={subscription.lastPaymentStatus}
                  />
                  <DetailRow
                    label={t('fields.lastPaymentAt')}
                    value={formatBillingDate(subscription.lastPaymentAt)}
                  />
                  <DetailRow label={t('fields.subscriptionId')} value={subscription.id} />
                </dl>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {subscription.checkoutUrl ? (
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => window.location.assign(subscription.checkoutUrl!)}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      {t('completeCheckoutCta')}
                    </Button>
                  ) : null}
                  {canManageBilling ? (
                    <Button
                      type="button"
                      variant={subscription.checkoutUrl ? 'outline' : 'default'}
                      className="gap-2"
                      disabled={checkoutMutation.isPending}
                      onClick={() => {
                        setCheckoutError(null)
                        setCheckoutSuccess(null)
                        if (subscription.planId) {
                          checkoutMutation.mutate(subscription.planId)
                        } else {
                          setCheckoutOpen(true)
                        }
                      }}
                    >
                      {checkoutMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <CreditCard className="size-4" aria-hidden />
                      )}
                      {t('renewCta')}
                    </Button>
                  ) : null}
                </div>

                {checkoutMutation.isError && !checkoutOpen ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-negative/25 bg-negative/5 px-5 py-4 text-sm text-negative"
                  >
                    {(checkoutMutation.error as unknown as ApiError)?.message ||
                      t('errors.checkoutFailed')}
                  </div>
                ) : null}

                <dl className="space-y-3 rounded-2xl border border-dash-border bg-dash-surface/30 p-5">
                  <DetailRow
                    label={t('fields.currentPeriodEnd')}
                    value={formatBillingDate(subscription.currentPeriodEnd)}
                  />
                  <DetailRow
                    label={t('fields.lastPaymentStatus')}
                    value={subscription.lastPaymentStatus}
                  />
                  <DetailRow
                    label={t('fields.lastPaymentAt')}
                    value={formatBillingDate(subscription.lastPaymentAt)}
                  />
                  <DetailRow label={t('fields.gateway')} value={subscription.gateway} />
                  <DetailRow
                    label={t('fields.gatewaySubscriptionId')}
                    value={subscription.gatewaySubscriptionId}
                  />
                </dl>
              </div>
            )}
          </DashboardPanel>
      </div>

      <DashboardPanel as="section" className="p-5 sm:p-6 md:p-7">
        <DashboardSectionHeader title={t('plansTitle')} description={t('plansDescription')} />

        <div className="mt-6 grid auto-rows-min grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlanKey
            const isSelected = plan.id === selectedPlanKey

            const priceLabel =
              plan.priceMonthly == null
                ? tSubs('customPrice')
                : `$${plan.priceMonthly.toLocaleString('en-US')}`

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative min-h-[30rem] rounded-2xl border bg-canvas/70 p-6',
                  isCurrent
                    ? 'border-primary/55 shadow-[0_0_0_1px_rgb(159_232_112/0.25)]'
                    : isSelected
                      ? 'border-primary/30'
                      : 'border-dash-border'
                )}
              >
                {plan.popular ? (
                  <span className="absolute right-5 top-5 rounded-lg bg-primary-pale px-2 py-0.5 text-[11px] font-semibold text-positive-deep ring-1 ring-primary/30">
                    {tSubs('popular')}
                  </span>
                ) : null}

                {isCurrent ? (
                  <div className="mb-4 inline-flex items-center rounded-md bg-primary-pale px-2 py-0.5 text-xs font-semibold text-positive-deep ring-1 ring-primary/25">
                    {t('currentPlanBadge')}
                  </div>
                ) : null}

                <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {tPlans(`${plan.id}.name`)}
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-body">
                  {tPlans(`${plan.id}.description`)}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">
                    {priceLabel}
                  </span>
                  {plan.priceMonthly != null ? (
                    <span className="text-sm text-mute">{tSubs('perMonth')}</span>
                  ) : null}
                </div>

                <dl className="mt-5 grid gap-2.5 rounded-2xl border border-dash-border bg-dash-surface/70 p-5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-mute">{tSubs('limits.users')}</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      {plan.limits.userLimit == null
                        ? tSubs('unlimited')
                        : plan.limits.userLimit.toLocaleString('en-US')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-mute">{tSubs('limits.messages')}</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      {plan.limits.messageLimit == null
                        ? tSubs('unlimited')
                        : plan.limits.messageLimit.toLocaleString('en-US')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-mute">{tSubs('limits.workspaces')}</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      {plan.limits.workspaceLimit == null
                        ? tSubs('unlimited')
                        : plan.limits.workspaceLimit.toLocaleString('en-US')}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {tSubs('featuresLabel')}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {plan.featureKeys.map((key) => (
                      <li
                        key={key}
                        className="flex items-start gap-2.5 text-sm text-body"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary-pale text-positive-deep">
                          ✓
                        </span>
                        <span>{tFeatures(key) ?? key}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  {plan.id === 'enterprise' ? (
                    <Button
                      type="button"
                      className="w-full gap-2"
                      variant="outline"
                      disabled={isCurrent}
                      onClick={() => {
                        setConfirmPlanKey('enterprise')
                        setConfirmOpen(true)
                      }}
                    >
                      {t('enterpriseCta')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="w-full gap-2"
                      disabled={isCurrent}
                      onClick={() => {
                        setConfirmPlanKey(plan.id)
                        setConfirmOpen(true)
                      }}
                    >
                      {t('changePlanCta')}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-5 sm:p-6 md:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {tCompare('title')}
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{tCompare('subtitle')}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto pb-2">
          <div className="min-w-[56rem]">
            <div className="grid grid-cols-5 gap-x-2 gap-y-0">
              <div className="py-1 pl-1 pr-2 text-left text-xs font-semibold tracking-wide text-mute uppercase">
                {tCompare('featureLabel')}
              </div>
              {PLANS.map((plan) => {
                const isCurrent = plan.id === currentPlanKey
                return (
                  <div
                    key={plan.id}
                    className={[
                      'py-1 text-center text-xs font-semibold tracking-wide uppercase',
                      isCurrent ? 'text-positive-deep' : 'text-mute',
                    ].join(' ')}
                  >
                    {tPlans(`${plan.id}.name`)}
                  </div>
                )
              })}

              {/* Limit rows */}
              <div className="col-span-1 pt-3 text-sm font-medium text-ink">
                {tSubs('limits.users')}
              </div>
              {PLANS.map((plan) => (
                <div key={plan.id} className="pt-3 text-center text-sm text-body">
                  {plan.limits.userLimit == null ? tCompareValues('custom') : plan.limits.userLimit}
                </div>
              ))}

              <div className="col-span-1 pt-3 text-sm font-medium text-ink">
                {tSubs('limits.messages')}
              </div>
              {PLANS.map((plan) => (
                <div key={plan.id} className="pt-3 text-center text-sm text-body">
                  {plan.limits.messageLimit == null ? tCompareValues('custom') : plan.limits.messageLimit}
                </div>
              ))}

              <div className="col-span-1 pt-3 text-sm font-medium text-ink">
                {tSubs('limits.workspaces')}
              </div>
              {PLANS.map((plan) => (
                <div key={plan.id} className="pt-3 text-center text-sm text-body">
                  {plan.limits.workspaceLimit == null ? tCompareValues('custom') : plan.limits.workspaceLimit}
                </div>
              ))}

              {/* Feature rows */}
              {compareFeatureKeys.map((featureKey) => (
                <div key={`feature-row-${featureKey}`} className="col-span-5">
                  <div className="grid grid-cols-5 gap-x-2 gap-y-0">
                    <div className="col-span-1 pt-3 text-sm text-body">
                      {tFeatures(featureKey) ?? featureKey}
                    </div>
                    {PLANS.map((plan) => {
                      const included = plan.featureKeys.includes(featureKey)
                      return (
                        <div
                          key={`${plan.id}-${featureKey}`}
                          className="flex items-center justify-center pt-3"
                          aria-label={included ? tCompareValues('yes') : tCompareValues('no')}
                        >
                          {included ? (
                            <Check className="size-4 text-positive-deep" aria-hidden />
                          ) : (
                            <Minus className="size-4 text-mute" aria-hidden />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardPanel>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!confirmOpen) return
          setConfirmOpen(next)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('changeDialogTitle')}</DialogTitle>
            <DialogDescription>{t('changeDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="p-5 sm:px-6">
            <p className="text-sm text-body">
              {confirmPlanKey ? tPlans(`${confirmPlanKey}.name`) : ''}
            </p>
            <p className="mt-2 text-sm text-mute">{t('changeDialogNoteUiOnly')}</p>
          </div>
          <DialogFooter className="border-t border-dash-border px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={false}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!confirmPlanKey) return
                setSelectedPlanKey(confirmPlanKey)
                setConfirmOpen(false)
              }}
            >
              {t('confirmChange')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingCheckoutDialog
        open={checkoutOpen}
        pending={checkoutMutation.isPending}
        error={checkoutError}
        initialPlanId={initialCheckoutPlanId}
        onOpenChange={setCheckoutOpen}
        onConfirm={(planId) => checkoutMutation.mutate(planId)}
      />
    </div>
  )
}
