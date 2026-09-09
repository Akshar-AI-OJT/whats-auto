/** Frontend plan catalog model. Map backend payloads into this shape when APIs exist. */

export const PLAN_STATUSES = ['active', 'draft', 'archived'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const PLAN_BILLING_PERIODS = ['monthly', 'yearly', 'custom'] as const
export type PlanBillingPeriod = (typeof PLAN_BILLING_PERIODS)[number]

export const PLAN_FEATURE_CATEGORY_IDS = [
  'messaging',
  'automation',
  'ai',
  'team',
  'integrations',
] as const
export type PlanFeatureCategoryId = (typeof PLAN_FEATURE_CATEGORY_IDS)[number]

export type PlanFeature = {
  key: string
  name: string
  enabled: boolean
  description?: string
  category: PlanFeatureCategoryId
}

export type PlanLimits = {
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
  aiRepliesPerMonth: number | null
  maxStoreConnections: number | null
  maxApiKeys: number | null
  maxWebhookEndpoints: number | null
  analyticsRetentionDays: number | null
  auditLogRetentionDays: number | null
  maxTemplates: number | null
  conversationInboxRetentionDays: number | null
  aiGenerationsPerConversationHour: number
  dispatchRatePerSec: number
}

export type SubscriptionPlan = {
  id: string
  name: string
  description: string
  price: number | null
  currency: 'INR' | 'USD'
  billingPeriod: PlanBillingPeriod
  status: PlanStatus
  popular: boolean
  trialDays: number | null
  limits: PlanLimits
  features: PlanFeature[]
  createdAt: string
  updatedAt: string
}

export type CreatePlanInput = {
  name: string
  description: string
  price: number | null
  currency: 'INR' | 'USD'
  billingPeriod: PlanBillingPeriod
  status: Exclude<PlanStatus, 'archived'>
  popular?: boolean
  trialDays: number | null
  limits: PlanLimits
  features: PlanFeature[]
}

export type UpdatePlanInput = Partial<CreatePlanInput>

export type ListPlansParams = {
  search?: string
  status?: PlanStatus | 'all'
}

export type PlanSummary = {
  total: number
  active: number
  draft: number
  archived: number
  popularName: string | null
}

export type PlanActionResult =
  | { ok: true; plan: SubscriptionPlan; messageKey?: string }
  | { ok: false; reason: 'not_found' | 'invalid'; messageKey: string }

export type PlanFeatureDefinition = {
  key: string
  /** Default English label when i18n is missing. */
  label: string
  category: PlanFeatureCategoryId
}

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  users: null,
  seats: null,
  whatsappNumbers: null,
  maxContacts: null,
  messagesPerMonth: null,
  campaignsPerMonth: null,
  maxBroadcastRecipients: null,
  storageBytes: null,
  maxFileUploadMb: 10,
  maxActiveFlows: null,
  maxKnowledgeDocs: null,
  maxKnowledgeDocSizeMb: null,
  aiRepliesPerMonth: null,
  maxStoreConnections: null,
  maxApiKeys: null,
  maxWebhookEndpoints: null,
  analyticsRetentionDays: null,
  auditLogRetentionDays: null,
  maxTemplates: null,
  conversationInboxRetentionDays: null,
  aiGenerationsPerConversationHour: 10,
  dispatchRatePerSec: 10,
}
