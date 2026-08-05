import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { PaymentWebhookWorker } from '#services/billing/payment_webhook_worker'

export type BillingPaymentWebhookJobData = {
  webhookEventId?: string
}

/**
 * Wakes PaymentWebhookWorker. Claim/lease/retry stay on payment_webhook_events.
 */
export function createBillingPaymentWebhookHandler(
  worker: PaymentWebhookWorker = new PaymentWebhookWorker()
): JobHandler {
  return async (job) => {
    const webhookEventId = job.data.webhookEventId

    if (typeof webhookEventId === 'string' && webhookEventId.length > 0) {
      const result = await worker.processById(webhookEventId)
      logger.info(
        { jobId: job.id, webhookEventId, outcome: result.outcome },
        'billing.payment_webhook.job.completed'
      )
      return
    }

    // Recovery wake without id: drain one due row.
    const result = await worker.processNextDue()
    logger.info(
      {
        jobId: job.id,
        webhookEventId: result.webhookEventId,
        outcome: result.outcome,
      },
      'billing.payment_webhook.job.recovery_completed'
    )
  }
}
