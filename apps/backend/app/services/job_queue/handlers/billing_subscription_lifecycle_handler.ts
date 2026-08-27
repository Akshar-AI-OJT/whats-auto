import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { SubscriptionLifecycleService } from '#services/billing/subscription_lifecycle_service'

export type BillingSubscriptionLifecycleJobData = {
  organizationId?: string
}

/**
 * Hourly sweep: expire stale orders, start grace, expire after grace, send reminders.
 */
export function createBillingSubscriptionLifecycleHandler(
  lifecycle: SubscriptionLifecycleService = new SubscriptionLifecycleService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const result = await lifecycle.run({ organizationId })
    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        expiredOrders: result.expiredOrders,
        pastDue: result.pastDue,
        expiredSubscriptions: result.expiredSubscriptions,
        reminders: result.reminders,
        scannedOrganizations: result.scannedOrganizations,
      },
      'billing.subscription.lifecycle.completed'
    )
  }
}
