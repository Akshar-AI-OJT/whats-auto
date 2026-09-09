import PlanRestrictionException from '#exceptions/plan_restriction_exception'
import { UsageMeterRepository, type UsageMetric } from '#repositories/usage_meter_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import type { PlanFeatureKey } from '#types/plans'

/**
 * Thin helpers for domain services to enforce plan features and numeric quotas.
 */
export class PlanEnforcementService {
  constructor(
    private entitlements: EntitlementService = new EntitlementService(),
    private meters: UsageMeterRepository = new UsageMeterRepository()
  ) {}

  async requireFeature(
    organizationId: string,
    featureKey: PlanFeatureKey,
    requiredPlan = 'Professional'
  ): Promise<void> {
    const ok = await this.entitlements.hasFeature(organizationId, featureKey)
    if (!ok) {
      throw PlanRestrictionException.featureDisabled(featureKey, requiredPlan)
    }
  }

  async requireUnderLimit(
    organizationId: string,
    limitKey: string,
    currentCount: number,
    requiredPlan = 'Professional'
  ): Promise<number | null> {
    const limit = await this.entitlements.getNumericLimit(organizationId, limitKey)
    if (limit === null) return null
    if (currentCount >= limit) {
      throw PlanRestrictionException.quotaExceeded(limitKey, currentCount, limit, requiredPlan)
    }
    return limit
  }

  async requireMeter(
    organizationId: string,
    metric: UsageMetric | string,
    limitKey: string,
    requiredPlan = 'Professional'
  ): Promise<{ usedCount: number; limitCount: number | null }> {
    const limitCount = await this.entitlements.getNumericLimit(organizationId, limitKey)
    return this.meters.checkAndIncrement({
      organizationId,
      metric,
      limitCount,
      requiredPlan,
    })
  }

  async getNumericLimit(organizationId: string, key: string): Promise<number | null> {
    return this.entitlements.getNumericLimit(organizationId, key)
  }

  async hasFeature(organizationId: string, featureKey: PlanFeatureKey): Promise<boolean> {
    return this.entitlements.hasFeature(organizationId, featureKey)
  }
}
