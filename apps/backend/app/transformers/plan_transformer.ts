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

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRequiredNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : fallback
}

/**
 * Prefer `aiRepliesPerMonth`. Legacy plans only stored `aiTokensPerMonth`;
 * map known marketing budgets to reply counts once at read time.
 */
function resolveAiRepliesPerMonth(limits: Record<string, unknown>): number | null {
  const replies = asNullableNumber(limits.aiRepliesPerMonth)
  if (replies !== null) return replies

  const tokens = asNullableNumber(limits.aiTokensPerMonth)
  if (tokens === null) return null
  if (tokens === 25_000) return 100
  if (tokens === 250_000) return 1000
  return null
}

export function transformPlanLimits(row: Pick<PlanRow, 'limits'>): PlanLimits {
  const limits = (row.limits ?? {}) as Record<string, unknown>
  const seats = asNullableNumber(limits.seats) ?? asNullableNumber(limits.users)
  const users = asNullableNumber(limits.users) ?? seats

  return {
    users,
    seats,
    whatsappNumbers: asNullableNumber(limits.whatsappNumbers),
    maxContacts: asNullableNumber(limits.maxContacts),
    messagesPerMonth: asNullableNumber(limits.messagesPerMonth),
    campaignsPerMonth: asNullableNumber(limits.campaignsPerMonth),
    maxBroadcastRecipients: asNullableNumber(limits.maxBroadcastRecipients),
    storageBytes: asNullableNumber(limits.storageBytes),
    maxFileUploadMb: asRequiredNumber(limits.maxFileUploadMb, 10),
    maxActiveFlows: asNullableNumber(limits.maxActiveFlows),
    maxKnowledgeDocs: asNullableNumber(limits.maxKnowledgeDocs),
    maxKnowledgeDocSizeMb: asNullableNumber(limits.maxKnowledgeDocSizeMb),
    aiRepliesPerMonth: resolveAiRepliesPerMonth(limits),
    maxStoreConnections: asNullableNumber(limits.maxStoreConnections),
    maxApiKeys: asNullableNumber(limits.maxApiKeys),
    maxWebhookEndpoints: asNullableNumber(limits.maxWebhookEndpoints),
    analyticsRetentionDays: asNullableNumber(limits.analyticsRetentionDays),
    auditLogRetentionDays: asNullableNumber(limits.auditLogRetentionDays),
    maxTemplates: asNullableNumber(limits.maxTemplates),
    conversationInboxRetentionDays: asNullableNumber(limits.conversationInboxRetentionDays),
    aiGenerationsPerConversationHour: asRequiredNumber(limits.aiGenerationsPerConversationHour, 10),
    dispatchRatePerSec: asRequiredNumber(limits.dispatchRatePerSec, 10),
  }
}

/**
 * Razorpay checkout eligibility — active paid plans (price > 0).
 * Keep in lockstep with `PlanRepository.findActivePaidCheckoutableById`.
 */
export function isPlanCheckoutable(row: Pick<PlanRow, 'isActive' | 'price'>): boolean {
  if (row.isActive !== true) return false
  return toNumber(row.price) > 0
}

function isCustomPricingRow(row: Pick<PlanRow, 'metadata' | 'billingInterval'>): boolean {
  const meta = asMetadata(row.metadata)
  return Boolean(meta.customPricing) || deriveBillingPeriod(row) === 'custom'
}

/**
 * Self-serve free activation — active catalog plans priced at zero (excludes custom/enterprise).
 * Keep in lockstep with `PlanRepository.findActiveFreeActivatableById`.
 */
export function isPlanFreeActivatable(
  row: Pick<PlanRow, 'isActive' | 'price' | 'metadata' | 'billingInterval'>
): boolean {
  if (row.isActive !== true) return false
  if (derivePlanStatus(row) !== 'active') return false
  if (isCustomPricingRow(row)) return false
  return toNumber(row.price) === 0
}

/** User may select and activate during onboarding or billing (free or paid Razorpay). */
export function isPlanSelfServeActivatable(
  row: Pick<PlanRow, 'isActive' | 'price' | 'metadata' | 'billingInterval'>
): boolean {
  return isPlanFreeActivatable(row) || isPlanCheckoutable(row)
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
    freeActivatable: isPlanFreeActivatable(row),
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
