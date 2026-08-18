import type {
  JobEnqueueOptions,
  JobHandler,
  JobQueueDriver,
} from '#services/job_queue/contracts/job_queue_driver'

/**
 * No-op / in-memory driver for tests. Enqueue is a silent success; work registers
 * handlers but never polls (outbound tests call executeDispatch directly).
 */
export default class NullJobQueueDriver implements JobQueueDriver {
  #started = false
  readonly handlers = new Map<string, JobHandler>()
  readonly enqueued: Array<{
    name: string
    data: Record<string, unknown>
    options?: JobEnqueueOptions
  }> = []
  readonly scheduled: Array<{
    name: string
    cron: string
    data?: Record<string, unknown>
    options?: { key?: string }
  }> = []
  readonly removed: Array<{ name: string; singletonKey: string }> = []

  async start(): Promise<void> {
    this.#started = true
  }

  async stop(): Promise<void> {
    this.#started = false
    this.handlers.clear()
  }

  async enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void> {
    this.enqueued.push({ name, data, options })
    return `null-${this.enqueued.length}`
  }

  async work(name: string, handler: JobHandler): Promise<void> {
    this.handlers.set(name, handler)
  }

  async schedule(
    name: string,
    cron: string,
    data?: Record<string, unknown>,
    options?: { key?: string }
  ): Promise<void> {
    this.scheduled.push({ name, cron, data, options })
  }

  async remove(name: string, singletonKey: string): Promise<void> {
    this.removed.push({ name, singletonKey })
  }

  get started() {
    return this.#started
  }

  /** Test helper: drop recorded enqueues between cases. */
  clearEnqueued(): void {
    this.enqueued.length = 0
  }

  clearScheduled(): void {
    this.scheduled.length = 0
  }
}
