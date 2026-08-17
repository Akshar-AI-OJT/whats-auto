import { Queue, Worker } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type {
  JobEnqueueOptions,
  JobHandler,
  JobQueueDriver,
  JobScheduleOptions,
} from '#services/job_queue/contracts/job_queue_driver'
import { mapBullmqEnqueueOptions } from '#services/job_queue/drivers/bullmq_enqueue_options'
import { createRedisConnection } from '#lib/redis/create_redis_connection'

export type BullmqDriverConfig = {
  redisUrl: string
  prefix: string
}

/**
 * BullMQ driver for all jobs. Domain owns retries — attempts is always 1.
 * singletonKey maps to jobId; a new enqueue with the same key replaces a
 * delayed/waiting job (debounce reset).
 */
export default class BullmqJobQueueDriver implements JobQueueDriver {
  #started = false
  #queues = new Map<string, Queue>()
  #workers: Worker[] = []

  constructor(private config: BullmqDriverConfig) {}

  async start(): Promise<void> {
    if (this.#started) return
    if (!this.config.redisUrl) {
      throw new Error('BullmqJobQueueDriver requires REDIS_URL')
    }
    const probe = createRedisConnection(this.config.redisUrl)
    await probe.connect()
    probe.disconnect()
    this.#started = true
  }

  async stop(): Promise<void> {
    await Promise.all(this.#workers.map((worker) => worker.close()))
    this.#workers = []
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()))
    this.#queues.clear()
    this.#started = false
  }

  async enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void> {
    const queue = this.#queue(name)
    const jobOpts = mapBullmqEnqueueOptions(options)

    if (jobOpts.jobId) {
      const existing = await queue.getJob(jobOpts.jobId)
      if (existing) {
        const state = await existing.getState()
        if (state === 'delayed' || state === 'waiting' || state === 'prioritized') {
          await existing.remove()
        }
      }
    }

    const job = await queue.add(name, data, jobOpts)
    return job.id
  }

  async work(name: string, handler: JobHandler): Promise<void> {
    this.#assertStarted()
    const worker = new Worker(
      name,
      async (job) => {
        await handler({
          id: String(job.id),
          name,
          data: (job.data ?? {}) as Record<string, unknown>,
        })
      },
      {
        connection: this.#connectionOptions(),
        prefix: this.config.prefix,
      }
    )
    this.#workers.push(worker)
  }

  async schedule(
    name: string,
    cron: string,
    data?: Record<string, unknown>,
    options?: JobScheduleOptions
  ): Promise<void> {
    const queue = this.#queue(name)
    await queue.add(name, data ?? {}, {
      attempts: 1,
      repeat: {
        pattern: cron,
        key: options?.key,
      },
    })
  }

  #queue(name: string): Queue {
    this.#assertStarted()
    let queue = this.#queues.get(name)
    if (!queue) {
      queue = new Queue(name, {
        connection: this.#connectionOptions(),
        prefix: this.config.prefix,
      })
      this.#queues.set(name, queue)
    }
    return queue
  }

  #connectionOptions(): ConnectionOptions {
    return {
      url: this.config.redisUrl,
      maxRetriesPerRequest: null,
    }
  }

  #assertStarted(): void {
    if (!this.#started) {
      throw new Error('BullmqJobQueueDriver has not been started')
    }
  }
}
