import env from '#start/env'
import { JOB_NAMES } from '#services/job_queue/job_names'

/**
 * Job queue driver selection. HTTP processes only enqueue; workers consume.
 * retryLimit is always 0 at the driver for outbound — domain owns backoff.
 */
const driver = (env.get('JOB_QUEUE_DRIVER') ?? 'null') as 'pgboss' | 'bullmq' | 'null'
const redisUrl = env.get('REDIS_URL') ?? ''

if (driver === 'bullmq' && !redisUrl) {
  throw new Error('REDIS_URL is required when JOB_QUEUE_DRIVER=bullmq')
}

const jobQueueConfig = {
  default: driver,

  drivers: {
    null: {},
    pgboss: {
      schema: env.get('JOB_QUEUE_PGBOSS_SCHEMA') ?? 'pgboss',
      queues: [
        JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
        JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY,
        JOB_NAMES.WHATSAPP_UNMATCHED_RECEIPTS_CLEANUP,
        JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS,
      ],
    },
    bullmq: {
      redisUrl,
      prefix: env.get('JOB_QUEUE_BULLMQ_PREFIX') ?? 'wa:bullmq',
    },
  },
}

export default jobQueueConfig
