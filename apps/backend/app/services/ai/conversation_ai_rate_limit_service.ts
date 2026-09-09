import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import { EntitlementService } from '#services/billing/entitlement_service'
import TenantRedisStore from '#services/redis/tenant_redis_store'

const DEFAULT_WINDOW_SECONDS = 60 * 60
const DEFAULT_HARD_CAP = 120
const DEFAULT_PLAN_LIMIT = 10

export type ConversationAiRateLimitResult = {
  allowed: boolean
  current: number
  limit: number
}

/**
 * Per-conversation AI generation rate limit (anti-spam).
 * Counts attempts (INCR before LLM). Fail closed when Redis is unavailable.
 */
export class ConversationAiRateLimitService {
  constructor(
    private entitlements: EntitlementService = new EntitlementService(),
    private store?: TenantRedisStore
  ) {}

  async checkAndIncrement(params: {
    organizationId: string
    conversationId: string
    windowSeconds?: number
  }): Promise<ConversationAiRateLimitResult> {
    const planLimit =
      (await this.entitlements.getNumericLimit(
        params.organizationId,
        'aiGenerationsPerConversationHour'
      )) ?? DEFAULT_PLAN_LIMIT
    const hardCap = env.get('AI_CONV_RATE_LIMIT_HARD_CAP') ?? DEFAULT_HARD_CAP
    const limit = Math.max(1, Math.min(planLimit, hardCap))
    const windowSeconds = params.windowSeconds ?? DEFAULT_WINDOW_SECONDS
    const key = tenantRedisKey('ai_rl', params.organizationId, params.conversationId)

    try {
      const store = this.store ?? (await app.container.make(TenantRedisStore))
      const current = await store.incr(key, windowSeconds)
      return {
        allowed: current <= limit,
        current,
        limit,
      }
    } catch {
      // Fail closed: treat as rate limited when Redis is down.
      return { allowed: false, current: limit + 1, limit }
    }
  }
}
