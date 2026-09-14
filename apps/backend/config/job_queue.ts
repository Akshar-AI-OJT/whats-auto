import env from '#start/env'

/**
 * Job queue driver selection. HTTP processes only enqueue; workers consume.
 * attempts is always 1 at the driver — domain owns backoff/retry.
 * All jobs (outbound, campaigns, media, billing, AI) use a single BullMQ driver.
 */
const defaultDriver = (env.get('JOB_QUEUE_DRIVER') ?? 'null') as 'bullmq' | 'null'
const redisUrl = env.get('REDIS_URL') ?? ''

if (defaultDriver === 'bullmq' && !redisUrl) {
  throw new Error('REDIS_URL is required when JOB_QUEUE_DRIVER=bullmq')
}

const jobQueueConfig = {
  default: defaultDriver,

  drivers: {
    null: {},
    bullmq: {
      redisUrl,
      prefix: env.get('JOB_QUEUE_BULLMQ_PREFIX') ?? 'wa:bullmq',
    },
  },
}

export default jobQueueConfig
