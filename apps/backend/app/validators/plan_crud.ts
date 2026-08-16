import vine from '@vinejs/vine'

export const PLAN_STATUSES = ['active', 'draft', 'archived'] as const
export const PLAN_BILLING_PERIODS = ['monthly', 'yearly', 'custom'] as const
export const PLAN_FEATURE_CATEGORIES = [
  'messaging',
  'automation',
  'ai',
  'team',
  'integrations',
] as const

const planLimitsSchema = vine.object({
  users: vine.number().withoutDecimals().min(0).nullable().optional(),
  messagesPerMonth: vine.number().withoutDecimals().min(0).nullable().optional(),
  workspaces: vine.number().withoutDecimals().min(0).nullable().optional(),
})

const planFeatureSchema = vine.object({
  key: vine.string().trim().minLength(1).maxLength(100),
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  enabled: vine.boolean(),
  description: vine.string().trim().maxLength(500).optional(),
  category: vine.enum(PLAN_FEATURE_CATEGORIES).optional(),
})

export const listSuperAdminPlansValidator = vine.create(
  vine.object({
    search: vine.string().trim().maxLength(200).optional(),
    status: vine.enum([...PLAN_STATUSES, 'all'] as const).optional(),
  })
)

export const planIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createSuperAdminPlanValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    description: vine.string().trim().maxLength(2000).optional(),
    code: vine.string().trim().minLength(1).maxLength(64).optional(),
    price: vine.number().min(0).nullable(),
    currency: vine.string().trim().fixedLength(3),
    billingPeriod: vine.enum(PLAN_BILLING_PERIODS),
    status: vine.enum(['active', 'draft'] as const),
    popular: vine.boolean().optional(),
    trialDays: vine.number().withoutDecimals().min(0).nullable().optional(),
    limits: planLimitsSchema,
    features: vine.array(planFeatureSchema).optional(),
    sortOrder: vine.number().withoutDecimals().min(0).optional(),
  })
)

export const updateSuperAdminPlanValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200).optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
    code: vine.string().trim().minLength(1).maxLength(64).optional(),
    price: vine.number().min(0).nullable().optional(),
    currency: vine.string().trim().fixedLength(3).optional(),
    billingPeriod: vine.enum(PLAN_BILLING_PERIODS).optional(),
    status: vine.enum(['active', 'draft'] as const).optional(),
    popular: vine.boolean().optional(),
    trialDays: vine.number().withoutDecimals().min(0).nullable().optional(),
    limits: planLimitsSchema.optional(),
    features: vine.array(planFeatureSchema).optional(),
    sortOrder: vine.number().withoutDecimals().min(0).optional(),
  })
)
