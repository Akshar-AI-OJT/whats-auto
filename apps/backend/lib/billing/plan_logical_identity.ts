import type { PlanBillingPeriod } from '#types/plans'

type PlanIdentitySource = {
  name: string
  billingInterval: string
  billingIntervalCount: number
  price: string | number
  currency: string
}

export const PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX = 'plans_active_logical_identity_unique'

/**
 * Expression list shared by the unique index and duplicate-detection SQL.
 * Keep these in lockstep with `planLogicalIdentityFromRow`.
 */
export const PLAN_LOGICAL_IDENTITY_EXPRESSIONS_SQL = `
    (lower(btrim("name"))),
    (CASE
      WHEN lower("billingInterval") IN ('year', 'yearly') THEN 'year'
      WHEN lower("billingInterval") = 'custom' THEN 'custom'
      ELSE 'month'
    END),
    COALESCE("billingIntervalCount", 1),
    "price",
    (upper("currency"))
`

/**
 * Partial unique index: one *active* row per logical plan SKU.
 * Archived/draft rows (isActive = false) are allowed as history.
 *
 * Identity is name + interval + interval count + price + currency — not `name`
 * alone, so monthly vs yearly and different currencies/prices stay distinct.
 */
export const CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "${PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX}"
  ON "plans" (
    ${PLAN_LOGICAL_IDENTITY_EXPRESSIONS_SQL}
  )
  WHERE "isActive" = true
`

export const DROP_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL = `
DROP INDEX IF EXISTS "${PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX}"
`

export type PlanLogicalIdentity = {
  name: string
  billingInterval: string
  billingIntervalCount: number
  price: number
  currency: string
}

export type PlanReferenceCounts = {
  subscriptionCount: number
  orderCount: number
  invoiceCount: number
}

/** Normalize persisted interval values (`month`/`monthly`, `year`/`yearly`). */
export function normalizeBillingInterval(interval: string): 'month' | 'year' | 'custom' {
  const value = interval.trim().toLowerCase()
  if (value === 'year' || value === 'yearly') return 'year'
  if (value === 'custom') return 'custom'
  return 'month'
}

export function billingPeriodToInterval(period: PlanBillingPeriod): 'month' | 'year' | 'custom' {
  if (period === 'yearly') return 'year'
  if (period === 'custom') return 'custom'
  return 'month'
}

export function toMajorPrice(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function planLogicalIdentityFromValues(input: PlanLogicalIdentity): PlanLogicalIdentity {
  return {
    name: input.name.trim(),
    billingInterval: normalizeBillingInterval(input.billingInterval),
    billingIntervalCount: input.billingIntervalCount >= 1 ? input.billingIntervalCount : 1,
    price: toMajorPrice(input.price),
    currency: input.currency.trim().toUpperCase(),
  }
}

export function planLogicalIdentityFromRow(row: PlanIdentitySource): PlanLogicalIdentity {
  return planLogicalIdentityFromValues({
    name: row.name,
    billingInterval: row.billingInterval,
    billingIntervalCount: row.billingIntervalCount || 1,
    price: toMajorPrice(row.price),
    currency: row.currency,
  })
}

/** Stable grouping key for equivalent active catalog plans. */
export function planLogicalIdentityKey(row: PlanIdentitySource): string {
  const identity = planLogicalIdentityFromRow(row)
  return [
    identity.name.toLowerCase(),
    identity.billingInterval,
    String(identity.billingIntervalCount),
    identity.price.toFixed(2),
    identity.currency,
  ].join('|')
}

/**
 * Pick the safest canonical row: most subscription/order/invoice references,
 * then oldest createdAt, then smallest id (stable).
 */
export function pickCanonicalPlanRow<T extends { id: string; createdAt: Date | string }>(
  rows: T[],
  refs?: ReadonlyMap<string, PlanReferenceCounts>
): T {
  if (rows.length === 0) {
    throw new Error('pickCanonicalPlanRow requires at least one row')
  }

  return [...rows].sort((left, right) => {
    if (refs) {
      const leftRefs = refs.get(left.id) ?? emptyRefs()
      const rightRefs = refs.get(right.id) ?? emptyRefs()
      if (rightRefs.subscriptionCount !== leftRefs.subscriptionCount) {
        return rightRefs.subscriptionCount - leftRefs.subscriptionCount
      }
      if (rightRefs.orderCount !== leftRefs.orderCount) {
        return rightRefs.orderCount - leftRefs.orderCount
      }
      if (rightRefs.invoiceCount !== leftRefs.invoiceCount) {
        return rightRefs.invoiceCount - leftRefs.invoiceCount
      }
    }

    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()
    if (leftTime !== rightTime) return leftTime - rightTime
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })[0]
}

function emptyRefs(): PlanReferenceCounts {
  return { subscriptionCount: 0, orderCount: 0, invoiceCount: 0 }
}

/**
 * Collapse equivalent active rows to one canonical plan, preserving the
 * incoming list order (sortOrder, name) of the kept rows.
 */
export function deduplicateActivePlanRows<
  T extends {
    id: string
    name: string
    billingInterval: string
    billingIntervalCount: number
    price: string | number
    currency: string
    createdAt: Date | string
  },
>(rows: T[], refs?: ReadonlyMap<string, PlanReferenceCounts>): T[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = planLogicalIdentityKey(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const keepIds = new Set<string>()
  for (const group of groups.values()) {
    keepIds.add(pickCanonicalPlanRow(group, refs).id)
  }

  return rows.filter((row) => keepIds.has(row.id))
}
