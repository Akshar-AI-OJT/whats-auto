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

  get started() {
    return this.#started
  }

  /** Test helper: drop recorded enqueues between cases. */
  clearEnqueued(): void {
    this.enqueued.length = 0
  }
}
