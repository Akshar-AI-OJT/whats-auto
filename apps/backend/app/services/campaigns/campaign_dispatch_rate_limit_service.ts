import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { tenantOrgRedisKey } from '#lib/redis/tenant_redis_keys'
import { EntitlementService } from '#services/billing/entitlement_service'
import TenantRedisStore from '#services/redis/tenant_redis_store'

const WINDOW_TTL_SECONDS = 2
const DEFAULT_HARD_CAP = 60
const DEFAULT_PLAN_LIMIT = 10

export type CampaignDispatchRateLimitResult =
  | { allowed: true; current: number; limit: number }
  | { allowed: false; retryAfterMs: number; current: number; limit: number }

/**
 * Per-org campaign Meta dispatch pacing (1-second fixed window via Redis INCR).
 * Fail closed when Redis is unavailable.
 */
export class CampaignDispatchRateLimitService {
  constructor(
    private entitlements: EntitlementService = new EntitlementService(),
    private store?: TenantRedisStore
  ) {}

  async checkAndConsume(params: {
    organizationId: string
    now?: Date
  }): Promise<CampaignDispatchRateLimitResult> {
    const planLimit =
      (await this.entitlements.getNumericLimit(params.organizationId, 'dispatchRatePerSec')) ??
      DEFAULT_PLAN_LIMIT
    const hardCap = env.get('CAMPAIGN_DISPATCH_RATE_HARD_CAP') ?? DEFAULT_HARD_CAP
    const limit = Math.max(1, Math.min(planLimit, hardCap))
    const now = params.now ?? new Date()
    const window = Math.floor(now.getTime() / 1000)
    const key = `${tenantOrgRedisKey('campaign_dispatch_rl', params.organizationId)}:${window}`
    const retryAfterMs = (window + 1) * 1000 - now.getTime()

    try {
      const store = this.store ?? (await app.container.make(TenantRedisStore))
      const current = await store.incr(key, WINDOW_TTL_SECONDS)
      if (current > limit) {
        return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs), current, limit }
      }
      return { allowed: true, current, limit }
    } catch {
      return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs), current: limit + 1, limit }
    }
  }
}
