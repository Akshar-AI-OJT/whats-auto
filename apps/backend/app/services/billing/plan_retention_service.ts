import { DateTime } from 'luxon'
import { EntitlementService } from '#services/billing/entitlement_service'

export type RetentionLimitKey =
  'analyticsRetentionDays' | 'auditLogRetentionDays' | 'conversationInboxRetentionDays'

/**
 * Resolves plan retention windows for list queries.
 * null days = no clamp (unlimited retention).
 */
export class PlanRetentionService {
  constructor(private entitlements: EntitlementService = new EntitlementService()) {}

  async cutoffDate(
    organizationId: string,
    limitKey: RetentionLimitKey,
    now: DateTime = DateTime.utc()
  ): Promise<Date | null> {
    const days = await this.entitlements.getNumericLimit(organizationId, limitKey)
    if (days === null || days <= 0) return null
    return now.minus({ days }).toJSDate()
  }
}
