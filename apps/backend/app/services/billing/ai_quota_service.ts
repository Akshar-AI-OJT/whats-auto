import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { UsageMeterRepository, USAGE_METRICS } from '#repositories/usage_meter_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import { NotificationService } from '#services/notification_service'
import { runWithTenant } from '#services/tenant_context'

export type AiQuotaPeek = {
  used: number
  limit: number | null
  percentUsed: number | null
  allowed: boolean
  nearLimit: boolean
}

/**
 * Org monthly customer LLM budget (RAG + conversation summaries).
 * Metered as discrete successful replies via `ai.customer_llm_calls`.
 * Embeddings are infrastructure cost and are not metered here.
 */
export class AiQuotaService {
  constructor(
    private entitlements: EntitlementService = new EntitlementService(),
    private meters: UsageMeterRepository = new UsageMeterRepository(),
    private notifications: NotificationService = new NotificationService()
  ) {}

  async resolveCallLimit(organizationId: string): Promise<number | null> {
    const replies = await this.entitlements.getNumericLimit(organizationId, 'aiRepliesPerMonth')
    if (replies === null) return null
    if (replies <= 0) return 0
    return replies
  }

  async peek(organizationId: string): Promise<AiQuotaPeek> {
    const limit = await this.resolveCallLimit(organizationId)
    const { usedCount, allowed } = await this.meters.peek({
      organizationId,
      metric: USAGE_METRICS.aiCustomerLlmCalls,
      limitCount: limit,
    })

    const percentUsed =
      limit === null || limit <= 0 ? (limit === 0 ? 100 : null) : (usedCount / limit) * 100

    return {
      used: usedCount,
      limit,
      percentUsed,
      allowed: limit === null ? true : usedCount < limit,
      nearLimit: percentUsed !== null && percentUsed >= 80 && allowed,
    }
  }

  async incrementOnSuccess(organizationId: string): Promise<AiQuotaPeek> {
    const limit = await this.resolveCallLimit(organizationId)
    await this.meters.increment({
      organizationId,
      metric: USAGE_METRICS.aiCustomerLlmCalls,
      limitCount: limit ?? Number.MAX_SAFE_INTEGER,
    })
    const peek = await this.peek(organizationId)
    if (peek.nearLimit) {
      await this.notifyNearCap(organizationId, peek)
    }
    return peek
  }

  async notifyNearCap(organizationId: string, peek?: AiQuotaPeek): Promise<void> {
    const state = peek ?? (await this.peek(organizationId))
    if (state.percentUsed === null || state.percentUsed < 80) return
    await this.#notifyAdminsOnce({
      organizationId,
      type: 'ai_quota_near_cap',
      title: 'AI quota nearly used',
      body: `Your organization has used ${Math.floor(state.percentUsed)}% of this month's AI reply quota (${state.used}/${state.limit ?? '∞'}).`,
      dedupeKey: 'near',
    })
  }

  async notifyExceeded(organizationId: string): Promise<void> {
    const state = await this.peek(organizationId)
    await this.#notifyAdminsOnce({
      organizationId,
      type: 'ai_quota_exceeded',
      title: 'AI quota exceeded',
      body: `Your organization has reached its monthly AI reply quota (${state.used}/${state.limit ?? 0}). AI replies are paused until the next period or an upgrade.`,
      dedupeKey: 'exceeded',
    })
  }

  async #notifyAdminsOnce(params: {
    organizationId: string
    type: string
    title: string
    body: string
    dedupeKey: string
  }): Promise<void> {
    try {
      await runWithTenant(params.organizationId, async () => {
        const periodStart = DateTime.utc().startOf('month').toISO()
        const existing = await db
          .from('notifications')
          .where('organizationId', params.organizationId)
          .where('type', params.type)
          .where('createdAt', '>=', periodStart)
          .first()
        if (existing) return

        const members = await db
          .from('organization_members as m')
          .join('roles as r', 'r.id', 'm.roleId')
          .where('m.organizationId', params.organizationId)
          .where('m.isDeleted', false)
          .whereIn('r.name', ['owner', 'admin'])
          .select('m.userId')

        for (const row of members) {
          await this.notifications.createNotification({
            organizationId: params.organizationId,
            userId: row.userId as string,
            type: params.type,
            title: params.title,
            body: params.body,
          })
        }
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          type: params.type,
          dedupeKey: params.dedupeKey,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.quota.notification_failed'
      )
    }
  }
}
