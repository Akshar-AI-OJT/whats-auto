export type PlanStatus = 'active' | 'draft' | 'archived'
export type PlanBillingPeriod = 'monthly' | 'yearly' | 'custom'
export type PlanFeatureCategory = 'messaging' | 'automation' | 'ai' | 'team' | 'integrations'

export type PlanFeature = {
  key: string
  /** Defaults to `key` when omitted by clients. */
  name?: string
  enabled: boolean
  description?: string
  category?: PlanFeatureCategory
}

export type PlanLimits = {
  users: number | null
  messagesPerMonth: number | null
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
  limits: {
    users?: number | null
    messagesPerMonth?: number | null
  }
  features?: PlanFeature[]
  sortOrder?: number
}

export type UpdateSuperAdminPlanInput = Omit<Partial<CreateSuperAdminPlanInput>, 'description'> & {
  /** Null clears description in update payloads. */
  description?: string | null
}
