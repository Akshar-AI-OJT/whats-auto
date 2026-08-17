import type { JobsOptions } from 'bullmq'
import type { JobEnqueueOptions } from '#services/job_queue/contracts/job_queue_driver'

/**
 * Domain owns retries — attempts is always 1.
 * singletonKey maps to jobId so a later enqueue with the same key can replace
 * a delayed/waiting job.
 */
export function mapBullmqEnqueueOptions(options?: JobEnqueueOptions): JobsOptions {
  const delay = options?.runAt ? Math.max(0, options.runAt.getTime() - Date.now()) : undefined

  return {
    attempts: 1,
    delay,
    jobId: options?.singletonKey,
    removeOnComplete: true,
    removeOnFail: false,
  }
}
