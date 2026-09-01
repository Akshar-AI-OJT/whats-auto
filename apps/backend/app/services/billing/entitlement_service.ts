import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { runWithTenant } from '#services/tenant_context'

/**
 * Read-model entitlements from the org's current plan.limits.
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
    return runWithTenant(organizationId, async () => {
      const subscription = await this.subscriptions.findCurrentForEntitlements(organizationId)
      if (!subscription) {
        return false
      }

      const plan = await this.plans.findById(subscription.planId)
      if (!plan) {
        return false
      }

      const limits = (plan.limits ?? {}) as Record<string, unknown>
      const value = limits[key]
      if (typeof value === 'boolean') {
        return value
      }
      if (typeof value === 'number') {
        return value > 0
      }
      return false
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
