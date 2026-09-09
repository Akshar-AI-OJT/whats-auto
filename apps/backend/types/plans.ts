export type PlanStatus = 'active' | 'draft' | 'archived'
export type PlanBillingPeriod = 'monthly' | 'yearly' | 'custom'
export type PlanFeatureCategory = 'messaging' | 'automation' | 'ai' | 'team' | 'integrations'

export const PLAN_FEATURE_KEYS = [
  'wabaConnection',
  'contactCsvImportExport',
  'customTemplates',
  'scheduledCampaigns',
  'flowBuilder',
  'flowAdvancedNodes',
  'aiAutonomous',
  'eCommerceIntegrations',
  'apiAccess',
  'customRoles',
] as const

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number]

export type PlanFeature = {
  key: PlanFeatureKey | string
  /** Defaults to `key` when omitted by clients. */
  name?: string
  enabled: boolean
  description?: string
  category?: PlanFeatureCategory
}

/**
 * Plan limits stored in `plans.limits` JSONB.
 * `null` = unlimited for commercial quotas.
 * Anti-abuse fields are always concrete numbers.
 */
export type PlanLimits = {
  /** Alias for seats in admin UI; mirrored to seats on persist. */
  users: number | null
  seats: number | null
  whatsappNumbers: number | null
  maxContacts: number | null
  messagesPerMonth: number | null
  campaignsPerMonth: number | null
  maxBroadcastRecipients: number | null
  storageBytes: number | null
  maxFileUploadMb: number
  maxActiveFlows: number | null
  maxKnowledgeDocs: number | null
  maxKnowledgeDocSizeMb: number | null
  /** Customer-facing monthly AI reply budget (RAG + summaries). null = unlimited. */
  aiRepliesPerMonth: number | null
  maxStoreConnections: number | null
  maxApiKeys: number | null
  maxWebhookEndpoints: number | null
  analyticsRetentionDays: number | null
  auditLogRetentionDays: number | null
  maxTemplates: number | null
  conversationInboxRetentionDays: number | null
  /** Anti-abuse: never null. */
  aiGenerationsPerConversationHour: number
  /** Anti-abuse (campaigns only): never null. */
  dispatchRatePerSec: number
}

export type SuperAdminPlan = {
  id: string
  code: string
  name: string
  description: string
  price: number | null
  currency: string
  billingPeriod: PlanBillingPeriod
  billingInterval: string
  billingIntervalCount: number
  status: PlanStatus
  popular: boolean
  trialDays: number | null
  limits: PlanLimits
  features: PlanFeature[]
  gateway: string | null
  gatewayPlanId: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string | null
}

/**
 * Tenant-safe billing catalog DTO (GET /api/v1/billing/plans).
 * Omits gateway internals and admin-only fields; exposes checkoutable (Razorpay) and freeActivatable.
 */
export type TenantBillingPlan = {
  id: string
  code: string
  name: string
  description: string
  price: number | null
  currency: string
  billingPeriod: PlanBillingPeriod
  popular: boolean
  trialDays: number | null
  limits: PlanLimits
  features: Array<{
    key: string
    name: string
    enabled: boolean
    category?: PlanFeatureCategory
  }>
  /** Razorpay checkout (price > 0). */
  checkoutable: boolean
  /** Local free activation (price === 0, not custom/enterprise). */
  freeActivatable: boolean
  sortOrder: number
}

export type SuperAdminPlanSummary = {
  total: number
  active: number
  draft: number
  archived: number
  popularName: string | null
}

export type CreateSuperAdminPlanInput = {
  name: string
  description?: string
  code?: string
  price: number | null
  currency: string
  billingPeriod: PlanBillingPeriod
  status: Exclude<PlanStatus, 'archived'>
  popular?: boolean
  trialDays?: number | null
  limits: Partial<PlanLimits>
  features?: PlanFeature[]
  sortOrder?: number
}

export type UpdateSuperAdminPlanInput = Omit<Partial<CreateSuperAdminPlanInput>, 'description'> & {
  /** Null clears description in update payloads. */
  description?: string | null
}

/** Default anti-abuse limits when omitted from create payloads. */
export const DEFAULT_ANTI_ABUSE_LIMITS = {
  maxFileUploadMb: 10,
  aiGenerationsPerConversationHour: 10,
  dispatchRatePerSec: 10,
} as const
