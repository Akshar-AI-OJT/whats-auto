import { STORAGE_BYTES_LIMIT_KEY } from '#lib/media/storage_types'
import { UsageMeterRepository, USAGE_METRICS } from '#repositories/usage_meter_repository'
import { OrganizationStorageUsageRepository } from '#repositories/organization_storage_usage_repository'
import { AiQuotaService } from '#services/billing/ai_quota_service'
import { EntitlementService } from '#services/billing/entitlement_service'
import { PLAN_FEATURE_KEYS, type PlanFeatureKey, type PlanLimits } from '#types/plans'
import { runWithTenant } from '#services/tenant_context'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { PlanRepository } from '#repositories/plan_repository'
import { transformPlanLimits } from '#transformers/plan_transformer'

export type EntitlementsSnapshot = {
  limits: PlanLimits | null
  features: Array<{ key: PlanFeatureKey; enabled: boolean }>
  usage: {
    messages: { used: number; limit: number | null }
    campaigns: { used: number; limit: number | null }
    aiCustomerLlmCalls: {
      used: number
      limit: number | null
      percentUsed: number | null
      nearLimit: boolean
      exceeded: boolean
    }
    storageBytes: { used: number; limit: number | null }
  }
}

/**
 * Aggregates plan limits, features, and current meter usage for the tenant UI.
 */
export class EntitlementsQueryService {
  constructor(
    private entitlements: EntitlementService = new EntitlementService(),
    private meters: UsageMeterRepository = new UsageMeterRepository(),
    private aiQuota: AiQuotaService = new AiQuotaService(),
    private storageUsage: OrganizationStorageUsageRepository = new OrganizationStorageUsageRepository(),
    private subscriptions: OrganizationSubscriptionRepository = new OrganizationSubscriptionRepository(),
    private plans: PlanRepository = new PlanRepository()
  ) {}

  async getSnapshot(organizationId: string): Promise<EntitlementsSnapshot> {
    return runWithTenant(organizationId, async () => {
      const subscription = await this.subscriptions.findCurrentForEntitlements(organizationId)
      const plan = subscription ? await this.plans.findById(subscription.planId) : null
      const limits = plan ? transformPlanLimits(plan) : null

      const features = await Promise.all(
        PLAN_FEATURE_KEYS.map(async (key) => ({
          key,
          enabled: await this.entitlements.hasFeature(organizationId, key),
        }))
      )

      const messagesLimit = await this.entitlements.getNumericLimit(
        organizationId,
        'messagesPerMonth'
      )
      const campaignsLimit = await this.entitlements.getNumericLimit(
        organizationId,
        'campaignsPerMonth'
      )
      const storageLimit = await this.entitlements.getNumericLimit(
        organizationId,
        STORAGE_BYTES_LIMIT_KEY
      )

      const messagesUsed = await this.meters.getCurrentCount(organizationId, USAGE_METRICS.messages)
      const campaignsUsed = await this.meters.getCurrentCount(
        organizationId,
        USAGE_METRICS.campaigns
      )
      const aiPeek = await this.aiQuota.peek(organizationId)
      const storageRow = await this.storageUsage.ensureRow(organizationId)

      return {
        limits,
        features,
        usage: {
          messages: { used: messagesUsed, limit: messagesLimit },
          campaigns: { used: campaignsUsed, limit: campaignsLimit },
          aiCustomerLlmCalls: {
            used: aiPeek.used,
            limit: aiPeek.limit,
            percentUsed: aiPeek.percentUsed,
            nearLimit: aiPeek.nearLimit,
            exceeded: !aiPeek.allowed,
          },
          storageBytes: {
            used: Number(storageRow.readyBytes ?? 0) + Number(storageRow.reservedBytes ?? 0),
            limit: storageLimit,
          },
        },
      }
    })
  }
}
