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
   * Numeric plan limit for the org, or null when missing / not entitled.
   */
  async getNumericLimit(organizationId: string, key: string): Promise<number | null> {
    const value = await this.getLimitValue(organizationId, key)
    return typeof value === 'number' ? value : null
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
}
