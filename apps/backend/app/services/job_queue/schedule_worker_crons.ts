import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import {
  BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON,
  CAMPAIGN_RECOVERY_CRON,
  INTEGRATION_EVENTS_RECOVERY_CRON,
  JOB_NAMES,
  MEDIA_PENDING_UPLOAD_CLEANUP_CRON,
  MEDIA_STORAGE_LIFECYCLE_CRON,
  WHATSAPP_OUTBOUND_RECOVERY_CRON,
} from '#services/job_queue/job_names'

type CronLogger = {
  info: (payload: Record<string, unknown>, msg: string) => void
}

/**
 * Recurring wakes the worker process must register. HTTP processes enqueue
 * one-shot jobs only — these crons recover work if a delayed job is lost.
 */
export async function scheduleWorkerCrons(
  driver: JobQueueDriver,
  logger: CronLogger
): Promise<void> {
  if (typeof driver.schedule !== 'function') return

  await driver.schedule(
    JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY,
    WHATSAPP_OUTBOUND_RECOVERY_CRON,
    {},
    { key: 'outbound-recovery' }
  )
  logger.info({ cron: WHATSAPP_OUTBOUND_RECOVERY_CRON }, 'job_queue.outbound_recovery.scheduled')

  await driver.schedule(
    JOB_NAMES.MEDIA_PENDING_UPLOAD_CLEANUP,
    MEDIA_PENDING_UPLOAD_CLEANUP_CRON,
    {},
    { key: 'media-pending-upload-cleanup' }
  )
  logger.info(
    { cron: MEDIA_PENDING_UPLOAD_CLEANUP_CRON },
    'job_queue.media_pending_upload_cleanup.scheduled'
  )

  await driver.schedule(
    JOB_NAMES.MEDIA_STORAGE_LIFECYCLE,
    MEDIA_STORAGE_LIFECYCLE_CRON,
    {},
    { key: 'media-storage-lifecycle' }
  )
  logger.info(
    { cron: MEDIA_STORAGE_LIFECYCLE_CRON },
    'job_queue.media_storage_lifecycle.scheduled'
  )

  await driver.schedule(JOB_NAMES.CAMPAIGN_RECOVERY, CAMPAIGN_RECOVERY_CRON, {}, {
    key: 'campaign-recovery',
  })
  logger.info({ cron: CAMPAIGN_RECOVERY_CRON }, 'job_queue.campaign_recovery.scheduled')

  // Billing recovery: sweep payment_webhook_events rows stuck in pending/failed.
  // Empty payload — handler calls processNextDue() when webhookEventId is absent.
  await driver.schedule(
    JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS,
    BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON,
    {},
    { key: 'billing-webhook-recovery' }
  )
  logger.info(
    { cron: BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON },
    'job_queue.billing_webhook_recovery.scheduled'
  )

  await driver.schedule(
    JOB_NAMES.INTEGRATION_EVENTS_RECOVERY,
    INTEGRATION_EVENTS_RECOVERY_CRON,
    {},
    { key: 'integration-events-recovery' }
  )
  logger.info(
    { cron: INTEGRATION_EVENTS_RECOVERY_CRON },
    'job_queue.integration_events_recovery.scheduled'
  )
}
