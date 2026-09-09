import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { PlanRetentionService } from '#services/billing/plan_retention_service'
import type { EntitlementService } from '#services/billing/entitlement_service'

test.group('PlanRetentionService', () => {
  test('returns null cutoff when retention is unlimited', async ({ assert }) => {
    const entitlements = {
      async getNumericLimit() {
        return null
      },
    } as unknown as EntitlementService

    const service = new PlanRetentionService(entitlements)
    const cutoff = await service.cutoffDate('org-1', 'auditLogRetentionDays')
    assert.isNull(cutoff)
  })

  test('computes cutoff from retention days', async ({ assert }) => {
    const entitlements = {
      async getNumericLimit() {
        return 14
      },
    } as unknown as EntitlementService

    const now = DateTime.fromISO('2026-08-31T12:00:00.000Z', { zone: 'utc' })
    const service = new PlanRetentionService(entitlements)
    const cutoff = await service.cutoffDate('org-1', 'conversationInboxRetentionDays', now)
    assert.isNotNull(cutoff)
    assert.equal(DateTime.fromJSDate(cutoff!, { zone: 'utc' }).toISODate(), '2026-08-17')
  })
})
