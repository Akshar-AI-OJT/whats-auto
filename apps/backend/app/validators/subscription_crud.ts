import vine from '@vinejs/vine'

const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'cancelled'] as const

/** Soft-deleted subscriptions use status = cancelled (no deletedAt column on this table). */
export const SUBSCRIPTION_SOFT_DELETED_STATUS = 'cancelled' as const

export const listSuperAdminSubscriptionsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const subscriptionIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createSuperAdminSubscriptionValidator = vine.create(
  vine.object({
    organizationId: vine.string().trim().uuid(),
    planId: vine.string().trim().uuid(),
    status: vine.enum(SUBSCRIPTION_STATUSES),
    currentPeriodStart: vine.date(),
    currentPeriodEnd: vine.date(),
    cancelAt: vine.date().optional(),
  })
)

export const updateSuperAdminSubscriptionValidator = vine.create(
  vine.object({
    planId: vine.string().trim().uuid().optional(),
    status: vine.enum(SUBSCRIPTION_STATUSES).optional(),
    currentPeriodStart: vine.date().optional(),
    currentPeriodEnd: vine.date().optional(),
    cancelAt: vine.date().nullable().optional(),
  })
)
