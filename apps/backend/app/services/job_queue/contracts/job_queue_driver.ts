/**
 * Neutral job-queue contract. Drivers: pgboss now, redis later.
 * Domain owns retry state; the queue only wakes work.
 */

export type JobEnqueueOptions = {
  /** Delayed wake — maps to pg-boss startAfter / Redis delayed jobs. */
  runAt?: Date
  /** Optional dedupe key (e.g. dispatchId) when the driver supports it. */
  singletonKey?: string
}

export type JobMessage = {
  id: string
  name: string
  data: Record<string, unknown>
}

export type JobHandler = (job: JobMessage) => Promise<void>

/**
 * Portable queue driver. Must not expose vendor types to callers.
 * Outbound send jobs must not use driver-level retries (retryLimit 0).
 */
export interface JobQueueDriver {
  start(): Promise<void>
  stop(): Promise<void>
  enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void>
  work(name: string, handler: JobHandler): Promise<void>
}
