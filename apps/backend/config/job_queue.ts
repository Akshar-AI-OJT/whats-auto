import env from '#start/env'
import { JOB_NAMES } from '#services/job_queue/job_names'

/**
 * Job queue driver selection. HTTP processes only enqueue; workers consume.
 * retryLimit is always 0 at the driver for outbound — domain owns backoff.
 */
const jobQueueConfig = {
  default: (env.get('JOB_QUEUE_DRIVER') ?? 'null') as 'pgboss' | 'null',

  drivers: {
    null: {},
    pgboss: {
      schema: env.get('JOB_QUEUE_PGBOSS_SCHEMA') ?? 'pgboss',
      queues: [
        JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
        JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY,
        JOB_NAMES.WHATSAPP_UNMATCHED_RECEIPTS_CLEANUP,
        JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS,
        JOB_NAMES.MEDIA_PENDING_UPLOAD_CLEANUP,
        JOB_NAMES.MEDIA_STORAGE_LIFECYCLE,
        JOB_NAMES.CAMPAIGN_EXECUTE,
        JOB_NAMES.CAMPAIGN_RECOVERY,
      ],
    },
  },
}

export default jobQueueConfig
