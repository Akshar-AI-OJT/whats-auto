import { Queue, Worker } from 'bullmq'
import type { Redis } from 'ioredis'
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
  #connection: Redis | null = null
  #started = false
  #queues = new Map<string, Queue>()
  #workers: Worker[] = []

  constructor(private config: BullmqDriverConfig) {}

  async start(): Promise<void> {
    if (this.#started) return
    if (!this.config.redisUrl) {
      throw new Error('BullmqJobQueueDriver requires REDIS_URL')
    }
    this.#connection = createRedisConnection(this.config.redisUrl)
    await this.#connection.connect()
    this.#started = true
  }

  async stop(): Promise<void> {
    await Promise.all(this.#workers.map((worker) => worker.close()))
    this.#workers = []
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()))
    this.#queues.clear()
    if (this.#connection) {
      this.#connection.disconnect()
      this.#connection = null
    }
    this.#started = false
  }

  async enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void> {
    const queue = this.#queue(name)
    const mapped = mapBullmqEnqueueOptions(options)

    if (mapped.jobId) {
      const existing = await queue.getJob(mapped.jobId)
      if (existing) {
        const state = await existing.getState()
        if (state === 'delayed' || state === 'waiting' || state === 'prioritized') {
          await existing.remove()
        }
      }
    }

    const job = await queue.add(name, data, mapped)
    return job.id
  }

  async remove(name: string, singletonKey: string): Promise<void> {
    const queue = this.#queue(name)
    const existing = await queue.getJob(singletonKey)
    if (!existing) return
    const state = await existing.getState()
    if (state === 'delayed' || state === 'waiting' || state === 'prioritized') {
      await existing.remove()
    }
  }

  async work(name: string, handler: JobHandler): Promise<void> {
    const connection = this.#requireConnection()
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
        connection: connection.duplicate(),
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
    const schedulerId = options?.key ?? name
    await queue.upsertJobScheduler(schedulerId, { pattern: cron }, { name, data: data ?? {} })
  }

  #queue(name: string): Queue {
    const existing = this.#queues.get(name)
    if (existing) return existing

    const queue = new Queue(name, {
      connection: this.#requireConnection().duplicate(),
      prefix: this.config.prefix,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    })
    this.#queues.set(name, queue)
    return queue
  }

  #requireConnection(): Redis {
    if (!this.#connection) {
      throw new Error('BullmqJobQueueDriver has not been started')
    }
    return this.#connection
  }
}
