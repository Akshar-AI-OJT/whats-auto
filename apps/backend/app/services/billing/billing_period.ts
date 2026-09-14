import type { DateTime } from 'luxon'

export const BILLING_ORDER_PURPOSES = ['new_subscription', 'renewal', 'plan_change'] as const
export type BillingOrderPurpose = (typeof BILLING_ORDER_PURPOSES)[number]

export const BILLING_GRACE_DAYS = 7

export function addBillingInterval(start: DateTime, interval: string, count: number): DateTime {
  const n = Math.max(1, count || 1)
  const normalized = interval.toLowerCase()
  if (normalized === 'year' || normalized === 'yearly') {
    return start.plus({ years: n })
  }
  if (normalized === 'week' || normalized === 'weekly') {
    return start.plus({ weeks: n })
  }
  if (normalized === 'day' || normalized === 'daily') {
    return start.plus({ days: n })
  }
  return start.plus({ months: n })
}

/**
 * Renewal starts at the unused currentPeriodEnd so early payment does not discard term.
 * New subscription and plan change start now.
 */
export function computeOrderPeriod(params: {
  purpose: BillingOrderPurpose
  billingInterval: string
  billingIntervalCount: number
  now: DateTime
  existingPeriodEnd?: DateTime | null
}): { periodStart: DateTime; periodEnd: DateTime } {
  let periodStart = params.now
  if (
    params.purpose === 'renewal' &&
    params.existingPeriodEnd &&
    params.existingPeriodEnd > params.now
  ) {
    periodStart = params.existingPeriodEnd
  }

  return {
    periodStart,
    periodEnd: addBillingInterval(periodStart, params.billingInterval, params.billingIntervalCount),
  }
}
