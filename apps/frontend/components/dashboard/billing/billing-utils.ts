import {
  api,
  type ApiError,
  type BillingCheckoutResult,
  type BillingSubscription,
  type TenantBillingPlan,
} from '@/lib/api'

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

export function unwrapBillingPlans(data: unknown): TenantBillingPlan[] {
  if (!data || typeof data !== 'object') return []
  const root = data as { data?: { items?: TenantBillingPlan[] }; items?: TenantBillingPlan[] }
  const items = root.data?.items ?? root.items
  return Array.isArray(items) ? items : []
}

export function formatTenantPlanPrice(
  price: number | null,
  currency: string,
  customLabel: string
): string {
  if (price == null) return customLabel
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(price)
  } catch {
    return `${currency} ${price.toLocaleString()}`
  }
}

/**
 * Resolve a plan feature label without throwing when the API key is absent from i18n.
 * Prefer known `admin.subscriptions.features.*` keys; otherwise use API name/key.
 */
export function resolvePlanFeatureLabel(
  tFeatures: { has: (key: string) => boolean; (key: string): string },
  featureKey: string,
  fallbackName?: string | null
): string {
  if (featureKey && tFeatures.has(featureKey)) {
    return tFeatures(featureKey)
  }
  const name = fallbackName?.trim()
  if (name) return name
  return featureKey
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

export function isCheckoutInProgressError(error: unknown): boolean {
  const apiError = error as ApiError | undefined
  if (!apiError) return false
  return apiError.status === 409 || apiError.code === 'E_BILLING_CHECKOUT_IN_PROGRESS'
}

function checkoutResultFromSubscription(
  subscription: BillingSubscription
): BillingCheckoutResult {
  return {
    subscriptionId: subscription.id,
    planId: subscription.planId,
    status: subscription.status,
    checkoutUrl: subscription.checkoutUrl ?? null,
    gatewaySubscriptionId: subscription.gatewaySubscriptionId ?? null,
  }
}

/**
 * POST /api/v1/billing/checkout with the internal plan UUID.
 * If a hosted checkout is already open for the org, resume that checkoutUrl.
 */
export async function startOrResumeBillingCheckout(
  planId: string
): Promise<BillingCheckoutResult> {
  try {
    const { data } = await api.billing.checkout({ planId })
    const result = unwrapBillingCheckout(data)
    if (!result) {
      throw new Error('Checkout did not return a subscription')
    }
    return result
  } catch (error) {
    if (!isCheckoutInProgressError(error)) throw error

    try {
      const { data } = await api.billing.getSubscription()
      const subscription = unwrapBillingSubscription(data)
      if (subscription?.checkoutUrl) {
        return checkoutResultFromSubscription(subscription)
      }
    } catch {
      /* fall through and rethrow the original 409 */
    }

    throw error
  }
}

export function isCapturedPayment(subscription: BillingSubscription | null): boolean {
  if (!subscription) return false
  const last = subscription.lastPaymentStatus?.toLowerCase()
  if (last === 'captured' || last === 'paid' || last === 'success') return true
  const status = subscription.status.toLowerCase()
  return (status === 'active' || status === 'authenticated') && !subscription.checkoutUrl
}

export function isFailedPayment(subscription: BillingSubscription | null): boolean {
  if (!subscription) return false
  const last = subscription.lastPaymentStatus?.toLowerCase()
  return last === 'failed'
}
