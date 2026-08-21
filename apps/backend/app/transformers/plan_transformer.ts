import type { PlanRow } from '#repositories/plan_repository'
import type {
  PlanBillingPeriod,
  PlanFeature,
  PlanLimits,
  PlanStatus,
  SuperAdminPlan,
  SuperAdminPlanSummary,
  TenantBillingPlan,
} from '#types/plans'

type PlanMetadata = {
  status?: PlanStatus
  popular?: boolean
  customPricing?: boolean
  billingPeriod?: PlanBillingPeriod
  features?: PlanFeature[]
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function asMetadata(value: unknown): PlanMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PlanMetadata
}

export function derivePlanStatus(row: Pick<PlanRow, 'isActive' | 'metadata'>): PlanStatus {
  const meta = asMetadata(row.metadata)
  if (meta.status === 'archived') return 'archived'
  if (meta.status === 'draft') return 'draft'
  if (meta.status === 'active') return 'active'
  return row.isActive ? 'active' : 'draft'
}

export function deriveBillingPeriod(
  row: Pick<PlanRow, 'billingInterval' | 'metadata'>
): PlanBillingPeriod {
  const meta = asMetadata(row.metadata)
  if (
    meta.billingPeriod === 'monthly' ||
    meta.billingPeriod === 'yearly' ||
    meta.billingPeriod === 'custom'
  ) {
    return meta.billingPeriod
  }
  const interval = row.billingInterval.toLowerCase()
  if (interval === 'year' || interval === 'yearly') return 'yearly'
  if (interval === 'custom') return 'custom'
  return 'monthly'
}

export function transformPlanLimits(row: Pick<PlanRow, 'limits'>): PlanLimits {
  const limits = (row.limits ?? {}) as Record<string, unknown>
  const users =
    typeof limits.users === 'number'
      ? limits.users
      : typeof limits.seats === 'number'
        ? limits.seats
        : null
  const messagesPerMonth =
    typeof limits.messagesPerMonth === 'number' ? limits.messagesPerMonth : null
  const workspaces = typeof limits.workspaces === 'number' ? limits.workspaces : null

  return { users, messagesPerMonth, workspaces }
}

/**
 * Same acceptance rules as `PlanRepository.findActiveCheckoutableById` /
 * Razorpay checkout. Keep this and the SQL filter in lockstep.
 */
export function isPlanCheckoutable(
  row: Pick<PlanRow, 'isActive' | 'gateway' | 'gatewayPlanId'>
): boolean {
  return row.isActive === true && row.gateway === 'razorpay' && Boolean(row.gatewayPlanId)
}

export function transformPlan(row: PlanRow): SuperAdminPlan {
  const meta = asMetadata(row.metadata)
  const billingPeriod = deriveBillingPeriod(row)
  const status = derivePlanStatus(row)
  const priceNumber = toNumber(row.price)
  const customPricing = Boolean(meta.customPricing) || billingPeriod === 'custom'

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    price: customPricing ? null : priceNumber,
    currency: row.currency,
    billingPeriod,
    billingInterval: row.billingInterval,
    billingIntervalCount: row.billingIntervalCount,
    status,
    popular: Boolean(meta.popular),
    trialDays: row.trialDays > 0 ? row.trialDays : null,
    limits: transformPlanLimits(row),
    features: Array.isArray(meta.features) ? meta.features : [],
    gateway: row.gateway,
    gatewayPlanId: row.gatewayPlanId,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt),
  }
}

/** Tenant catalog projection — no gateway secrets or admin-only fields. */
export function transformTenantBillingPlan(row: PlanRow): TenantBillingPlan {
  const plan = transformPlan(row)
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    popular: plan.popular,
    trialDays: plan.trialDays,
    limits: plan.limits,
    features: (plan.features ?? []).map((feature) => ({
      key: feature.key,
      name: feature.name || feature.key,
      enabled: Boolean(feature.enabled),
      ...(feature.category ? { category: feature.category } : {}),
    })),
    checkoutable: isPlanCheckoutable(row),
    sortOrder: plan.sortOrder,
  }
}

export function buildPlanSummary(rows: PlanRow[]): SuperAdminPlanSummary {
  let active = 0
  let draft = 0
  let archived = 0
  let popularName: string | null = null

  for (const row of rows) {
    const status = derivePlanStatus(row)
    if (status === 'active') active += 1
    else if (status === 'draft') draft += 1
    else archived += 1

    const meta = asMetadata(row.metadata)
    if (!popularName && meta.popular && status === 'active') {
      popularName = row.name
    }
  }

  return {
    total: rows.length,
    active,
    draft,
    archived,
    popularName,
  }
}
