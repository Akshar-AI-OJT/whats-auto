import type { ApiError, BillingCheckoutResult, BillingSubscription } from '@/lib/api'

export const billingQueryKeys = {
  all: ['billing'] as const,
  subscription: (orgId: string | null | undefined) =>
    [...billingQueryKeys.all, 'subscription', orgId ?? 'none'] as const,
}

export function unwrapBillingSubscription(data: unknown): BillingSubscription | null {
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'id' in data && 'planId' in data) {
    return data as BillingSubscription
  }
  const wrapped = data as { data?: BillingSubscription }
  return wrapped.data ?? null
}

export function unwrapBillingCheckout(data: unknown): BillingCheckoutResult | null {
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'subscriptionId' in data) {
    return data as BillingCheckoutResult
  }
  const wrapped = data as { data?: BillingCheckoutResult }
  return wrapped.data ?? null
}

export function isSubscriptionNotFound(error: unknown): boolean {
  const apiError = error as ApiError | undefined
  if (!apiError) return false
  return (
    apiError.status === 404 ||
    apiError.code === 'E_BILLING_SUBSCRIPTION_NOT_FOUND'
  )
}

export function formatBillingDate(value: string | null | undefined) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function billingStatusTone(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'active') {
    return 'bg-primary-pale text-positive-deep border-primary/25'
  }
  if (normalized === 'trialing') {
    return 'bg-warning/15 text-ink border-warning/30'
  }
  if (normalized === 'past_due') {
    return 'bg-negative/10 text-negative border-negative/25'
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'bg-dash-surface text-body border-dash-border'
  }
  return 'bg-dash-surface text-body border-dash-border'
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidPlanId(value: string) {
  return UUID_RE.test(value.trim())
}
