import type { PlanBillingPeriod, PlanStatus, SubscriptionPlan } from './types'

export function formatPlanPrice(
  plan: Pick<SubscriptionPlan, 'price' | 'currency' | 'billingPeriod'>,
  customLabel: string,
  perMonth: string,
  perYear: string
) {
  if (plan.price == null || plan.billingPeriod === 'custom') return customLabel
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(plan.price)
  if (plan.billingPeriod === 'yearly') return `${amount}${perYear}`
  return `${amount}${perMonth}`
}

export function formatLimit(value: number | null | undefined, unlimited: string) {
  if (value == null) return unlimited
  return value.toLocaleString('en-US')
}

export function formatPlanDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function enabledFeatureCount(plan: Pick<SubscriptionPlan, 'features'>) {
  return plan.features.filter((feature) => feature.enabled).length
}

export function planStatusTone(status: PlanStatus) {
  switch (status) {
    case 'active':
      return 'bg-primary-pale text-positive-deep ring-primary/25'
    case 'draft':
      return 'bg-[#FFF4E5] text-[#B45309] ring-[#FDBA74]/50'
    case 'archived':
      return 'bg-mute/15 text-mute ring-dash-border'
    default:
      return 'bg-mute/15 text-mute ring-dash-border'
  }
}

export function billingPeriodLabel(
  period: PlanBillingPeriod,
  labels: Record<PlanBillingPeriod, string>
) {
  return labels[period]
}
