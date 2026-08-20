/**
 * Neutral job-queue contract. Drivers: bullmq | null.
 * Domain owns retry state; the queue only wakes work.
 */

export type JobEnqueueOptions = {
  /** Delayed wake — maps to a Redis delayed job (ms from now). */
  runAt?: Date
  /** Optional dedupe key (e.g. dispatchId) when the driver supports it. */
  singletonKey?: string
}

export type JobScheduleOptions = {
  /** Optional key for idempotent cron scheduler upsert. */
  key?: string
}

export type JobMessage = {
  id: string
  name: string
  data: Record<string, unknown>
}

export type JobHandler = (job: JobMessage) => Promise<void>

/**
 * Portable queue driver. Must not expose vendor types to callers.
 * Outbound send jobs must not use driver-level retries (attempts: 1).
 */
export interface JobQueueDriver {
  start(): Promise<void>
  stop(): Promise<void>
  enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void>
  /**
   * Remove a delayed/waiting job by singleton key. Optional — campaign cancel
   * is best-effort when the driver cannot unschedule.
   */
  remove?(name: string, singletonKey: string): Promise<void>
  work(name: string, handler: JobHandler): Promise<void>
  /**
   * Register a recurring cron wake. Optional on drivers that
   * only support one-shot enqueue; NullJobQueueDriver records for tests.
   */
  schedule?(
    name: string,
    cron: string,
    data?: Record<string, unknown>,
    options?: JobScheduleOptions
  ): Promise<void>
}
