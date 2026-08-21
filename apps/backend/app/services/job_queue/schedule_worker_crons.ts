import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import {
  CAMPAIGN_RECOVERY_CRON,
  JOB_NAMES,
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
  logger.info(
    { cron: WHATSAPP_OUTBOUND_RECOVERY_CRON },
    'job_queue.outbound_recovery.scheduled'
  )

  await driver.schedule(JOB_NAMES.CAMPAIGN_RECOVERY, CAMPAIGN_RECOVERY_CRON, {}, {
    key: 'campaign-recovery',
  })
  logger.info({ cron: CAMPAIGN_RECOVERY_CRON }, 'job_queue.campaign_recovery.scheduled')
}
