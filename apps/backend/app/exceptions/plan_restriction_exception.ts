import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export type PlanRestrictionMeta = {
  restrictionType: 'feature' | 'numeric_quota' | 'metered_quota' | 'rate_limit' | 'size_limit'
  key: string
  limit?: number | null
  current?: number
  requiredPlan?: string
}

/**
 * Tenant plan entitlement violations (paywall / quota).
 * Distinct from PlanException (super-admin plan catalog CRUD).
 */
export default class PlanRestrictionException extends Exception {
  static status = 403
  static code = 'E_PLAN_RESTRICTION_VIOLATED'

  constructor(
    message: string,
    public readonly meta: PlanRestrictionMeta
  ) {
    super(message, { status: 403, code: 'E_PLAN_RESTRICTION_VIOLATED' })
  }

  static featureDisabled(featureKey: string, requiredPlan = 'Professional') {
    return new PlanRestrictionException(
      `Feature '${featureKey}' is not available on your current plan.`,
      {
        restrictionType: 'feature',
        key: featureKey,
        requiredPlan,
      }
    )
  }

  static quotaExceeded(key: string, current: number, limit: number, requiredPlan = 'Professional') {
    return new PlanRestrictionException(
      `Plan quota exceeded for '${key}'. Current: ${current}, Limit: ${limit}.`,
      {
        restrictionType: 'numeric_quota',
        key,
        current,
        limit,
        requiredPlan,
      }
    )
  }

  static meteredQuotaExceeded(
    key: string,
    current: number,
    limit: number,
    requiredPlan = 'Professional'
  ) {
    return new PlanRestrictionException(
      `Plan metered quota exceeded for '${key}'. Current: ${current}, Limit: ${limit}.`,
      {
        restrictionType: 'metered_quota',
        key,
        current,
        limit,
        requiredPlan,
      }
    )
  }

  static sizeLimitExceeded(key: string, current: number, limit: number) {
    return new PlanRestrictionException(
      `Size limit exceeded for '${key}'. Current: ${current}, Limit: ${limit}.`,
      {
        restrictionType: 'size_limit',
        key,
        current,
        limit,
      }
    )
  }

  async handle(error: this, ctx: HttpContext) {
    return ctx.response.status(error.status).send({
      error: error.message,
      code: error.code,
      meta: error.meta,
    })
  }

  report(error: this, { logger }: HttpContext) {
    logger.warn({ code: error.code, meta: error.meta }, error.message)
  }
}
