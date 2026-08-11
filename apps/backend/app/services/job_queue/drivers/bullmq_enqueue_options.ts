import type { JobEnqueueOptions } from '#services/job_queue/contracts/job_queue_driver'

export type BullmqMappedJobOptions = {
  attempts: 1
  delay?: number
  jobId?: string
}

/**
 * Map the portable enqueue contract onto BullMQ JobsOptions.
 * attempts: 1 matches pg-boss retryLimit: 0 (domain owns retries).
 */
export function mapBullmqEnqueueOptions(
  options?: JobEnqueueOptions,
  nowMs: number = Date.now()
): BullmqMappedJobOptions {
  const mapped: BullmqMappedJobOptions = { attempts: 1 }

  if (options?.runAt) {
    mapped.delay = Math.max(0, options.runAt.getTime() - nowMs)
  }

  if (options?.singletonKey) {
    mapped.jobId = options.singletonKey
  }

  return mapped
}
