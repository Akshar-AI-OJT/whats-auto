import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { runWithTenant } from '#services/tenant_context'
import type { PlanFeatureKey } from '#types/plans'

/**
 * Read-model entitlements from the org's current plan.limits / metadata.features.
 * Does not call Razorpay.
 */
export class EntitlementService {
  constructor(
    protected plans: PlanRepository = new PlanRepository(),
    protected subscriptions: OrganizationSubscriptionRepository = new OrganizationSubscriptionRepository()
  ) {}

  /**
   * Returns whether the organization currently has the given entitlement key.
   * - boolean limits: true when value is true
   * - numeric limits: true when value > 0
   * - missing key / no entitled subscription: false
   */
  async hasEntitlement(organizationId: string, key: string): Promise<boolean> {
    const value = await this.getLimitValue(organizationId, key)
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      return value > 0
    }
    return false
  }

  /**
   * Whether the org's active plan has a named feature flag enabled.
   * Reads from plan.metadata.features[] — not from limits JSONB.
   */
  async hasFeature(organizationId: string, featureKey: PlanFeatureKey | string): Promise<boolean> {
    return runWithTenant(organizationId, async () => {
      const subscription = await this.subscriptions.findCurrentForEntitlements(organizationId)
      if (!subscription) return false

      const plan = await this.plans.findById(subscription.planId)
      if (!plan) return false

      const metadata = (plan.metadata ?? {}) as Record<string, unknown>
      const features = Array.isArray(metadata.features)
        ? (metadata.features as Array<{ key: string; enabled: boolean }>)
        : []

      const feature = features.find((f) => f.key === featureKey)
      return feature?.enabled === true
    })
  }

  private async getLimitValue(organizationId: string, key: string): Promise<unknown> {
    return runWithTenant(organizationId, async () => {
      const subscription = await this.subscriptions.findCurrentForEntitlements(organizationId)
      if (!subscription) {
        return null
      }

      const plan = await this.plans.findById(subscription.planId)
      if (!plan) {
        return null
      }

      const limits = (plan.limits ?? {}) as Record<string, unknown>
      return limits[key] ?? null
    })
  }

  /**
   * Numeric plan.limits[key] for the org's current entitled subscription.
   * Returns null when there is no subscription, missing key, or non-numeric
   * value — callers treat null as unlimited.
   */
  async getNumericLimit(organizationId: string, key: string): Promise<number | null> {
    return runWithTenant(organizationId, async () => {
      const subscription = await this.subscriptions.findCurrentForEntitlements(organizationId)
      if (!subscription) {
        return null
      }

      const plan = await this.plans.findById(subscription.planId)
      if (!plan) {
        return null
      }

      const value = (plan.limits ?? {})[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value
      }
      return null
    })
  }
}
