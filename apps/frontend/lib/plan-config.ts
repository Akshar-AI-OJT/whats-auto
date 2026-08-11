export type PlanId = 'starter' | 'growth' | 'scale' | 'enterprise'

export type PlanLimits = {
  userLimit: number | null
  messageLimit: number | null
  workspaceLimit: number | null
}

export type PlanConfig = {
  id: PlanId

  /** i18n keys (kept as keys so UI can stay localized). */
  nameKey: string
  descriptionKey: string

  priceMonthly: number | null
  currency: 'USD'
  interval: 'month'

  limits: PlanLimits
  featureKeys: string[]

  popular?: boolean

  /** UI-only “billing plan UUID” mapping used for highlighting current subscription. */
  checkoutPlanId: string | null
}

/**
 * Temporary frontend-only plan configuration.
 * Later replace this with something like: api.billing.plans()
 * without rewriting the UI components.
 */
export const PLANS: PlanConfig[] = [
  {
    id: 'starter',
    nameKey: 'admin.subscriptions.plans.starter.name',
    descriptionKey: 'admin.subscriptions.plans.starter.description',
    priceMonthly: 29,
    currency: 'USD',
    interval: 'month',
    limits: { userLimit: 3, messageLimit: 5_000, workspaceLimit: 1 },
    featureKeys: ['inbox', 'basicCampaigns', 'templates', 'emailSupport'],
    popular: false,
    checkoutPlanId: '55c5e165-97f1-45b0-b3d1-801b79f4ff98',
  },
  {
    id: 'growth',
    nameKey: 'admin.subscriptions.plans.growth.name',
    descriptionKey: 'admin.subscriptions.plans.growth.description',
    priceMonthly: 99,
    currency: 'USD',
    interval: 'month',
    limits: { userLimit: 10, messageLimit: 25_000, workspaceLimit: 3 },
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'prioritySupport',
    ],
    popular: true,
    checkoutPlanId: '4854c623-f7d6-45a1-a4cd-a262e652f57a',
  },
  {
    id: 'scale',
    nameKey: 'admin.subscriptions.plans.scale.name',
    descriptionKey: 'admin.subscriptions.plans.scale.description',
    priceMonthly: 249,
    currency: 'USD',
    interval: 'month',
    limits: { userLimit: 40, messageLimit: 100_000, workspaceLimit: 10 },
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'webhooks',
      'roles',
      'prioritySupport',
    ],
    popular: false,
    checkoutPlanId: 'b1aaef4d-7933-4965-9cff-69217166513d',
  },
  {
    id: 'enterprise',
    nameKey: 'admin.subscriptions.plans.enterprise.name',
    descriptionKey: 'admin.subscriptions.plans.enterprise.description',
    priceMonthly: null,
    currency: 'USD',
    interval: 'month',
    limits: { userLimit: null, messageLimit: null, workspaceLimit: null },
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'webhooks',
      'roles',
      'sso',
      'dedicatedSupport',
      'sla',
    ],
    popular: false,
    checkoutPlanId: null,
  },
]

export function getPlanById(id: PlanId): PlanConfig | undefined {
  return PLANS.find((p) => p.id === id)
}

export function planKeyFromCheckoutPlanId(planId: string | null | undefined): PlanId | null {
  if (!planId) return null
  const match = PLANS.find((p) => p.checkoutPlanId === planId)
  return match?.id ?? null
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === 'starter' || value === 'growth' || value === 'scale' || value === 'enterprise'
}

