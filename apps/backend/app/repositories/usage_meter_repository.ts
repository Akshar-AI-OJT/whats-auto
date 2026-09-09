import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PlanRestrictionException from '#exceptions/plan_restriction_exception'

export const USAGE_METRICS = {
  messages: 'messages',
  campaigns: 'campaigns',
  aiCustomerLlmCalls: 'ai.customer_llm_calls',
} as const

export type UsageMetric = (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS]

/**
 * Atomic usage meters for plan quota enforcement (calendar month periods).
 */
export class UsageMeterRepository {
  periodBounds(now: DateTime = DateTime.utc()): { periodStart: Date; periodEnd: Date } {
    return {
      periodStart: now.startOf('month').toJSDate(),
      periodEnd: now.endOf('month').toJSDate(),
    }
  }

  async getCurrentCount(
    organizationId: string,
    metric: string,
    periodStart?: Date
  ): Promise<number> {
    const start = periodStart ?? this.periodBounds().periodStart
    const row = await db
      .from('usage_meters')
      .where({ organizationId, metric, periodStart: start })
      .select('usedCount')
      .first()
    return Number(row?.usedCount ?? 0)
  }

  /**
   * Peek current usage without incrementing.
   * null limitCount means unlimited.
   */
  async peek(params: {
    organizationId: string
    metric: string
    limitCount: number | null
  }): Promise<{ usedCount: number; limitCount: number | null; allowed: boolean }> {
    const { organizationId, metric, limitCount } = params
    const usedCount = await this.getCurrentCount(organizationId, metric)
    if (limitCount === null) {
      return { usedCount, limitCount: null, allowed: true }
    }
    return {
      usedCount,
      limitCount,
      allowed: usedCount < limitCount,
    }
  }

  /**
   * Atomically increments usedCount when within limit.
   * Throws PlanRestrictionException when the increment would exceed limitCount.
   */
  async checkAndIncrement(params: {
    organizationId: string
    metric: string
    limitCount: number | null
    incrementBy?: number
    requiredPlan?: string
  }): Promise<{ usedCount: number; limitCount: number | null }> {
    const { organizationId, metric, limitCount, incrementBy = 1, requiredPlan } = params
    if (limitCount === null) {
      return { usedCount: 0, limitCount: null }
    }

    const { periodStart, periodEnd } = this.periodBounds()

    const result = await db.rawQuery(
      `
      INSERT INTO "usage_meters" ("organizationId", "metric", "periodStart", "periodEnd", "usedCount", "limitCount")
      VALUES (:organizationId, :metric, :periodStart, :periodEnd, :incrementBy, :limitCount)
      ON CONFLICT ("organizationId", "metric", "periodStart")
      DO UPDATE SET
        "usedCount" = "usage_meters"."usedCount" + :incrementBy,
        "limitCount" = :limitCount
      WHERE "usage_meters"."usedCount" + :incrementBy <= :limitCount
      RETURNING "usedCount", "limitCount";
      `,
      {
        organizationId,
        metric,
        periodStart,
        periodEnd,
        incrementBy,
        limitCount,
      }
    )

    const rows = (result.rows ?? result) as Array<{ usedCount: number; limitCount: number }>
    if (!rows.length) {
      const current = await this.getCurrentCount(organizationId, metric, periodStart)
      throw PlanRestrictionException.meteredQuotaExceeded(metric, current, limitCount, requiredPlan)
    }

    return {
      usedCount: Number(rows[0].usedCount),
      limitCount: Number(rows[0].limitCount),
    }
  }

  /**
   * Increment without a hard fail when already over (used after peek-allowed generation).
   * Still respects limit when possible; if over, bumps usedCount anyway for accuracy.
   */
  async increment(params: {
    organizationId: string
    metric: string
    limitCount: number | null
    incrementBy?: number
  }): Promise<{ usedCount: number; limitCount: number | null }> {
    const { organizationId, metric, limitCount, incrementBy = 1 } = params
    if (limitCount === null) {
      return { usedCount: 0, limitCount: null }
    }

    const { periodStart, periodEnd } = this.periodBounds()

    const result = await db.rawQuery(
      `
      INSERT INTO "usage_meters" ("organizationId", "metric", "periodStart", "periodEnd", "usedCount", "limitCount")
      VALUES (:organizationId, :metric, :periodStart, :periodEnd, :incrementBy, :limitCount)
      ON CONFLICT ("organizationId", "metric", "periodStart")
      DO UPDATE SET
        "usedCount" = "usage_meters"."usedCount" + :incrementBy,
        "limitCount" = :limitCount
      RETURNING "usedCount", "limitCount";
      `,
      {
        organizationId,
        metric,
        periodStart,
        periodEnd,
        incrementBy,
        limitCount,
      }
    )

    const rows = (result.rows ?? result) as Array<{ usedCount: number; limitCount: number }>
    return {
      usedCount: Number(rows[0]?.usedCount ?? incrementBy),
      limitCount: Number(rows[0]?.limitCount ?? limitCount),
    }
  }
}
