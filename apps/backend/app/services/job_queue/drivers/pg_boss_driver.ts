import { PgBoss } from 'pg-boss'
import env from '#start/env'
import type {
  JobEnqueueOptions,
  JobHandler,
  JobQueueDriver,
} from '#services/job_queue/contracts/job_queue_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'

type PgBossDriverConfig = {
  schema: string
  /** Known queues to create with retryLimit 0 before workers start. */
  queues: string[]
}

/**
 * pg-boss driver. Domain owns outbound retries — queues are created with retryLimit: 0.
 */
export default class PgBossJobQueueDriver implements JobQueueDriver {
  #boss: PgBoss | null = null
  #started = false

  constructor(private config: PgBossDriverConfig) {}

  async start(): Promise<void> {
    if (this.#started) return

    const boss = new PgBoss({
      host: env.get('PG_HOST'),
      port: env.get('PG_PORT'),
      user: env.get('PG_USER'),
      password: env.get('PG_PASSWORD').release(),
      database: env.get('PG_DB_NAME'),
      ssl: env.get('PG_SSL') ? { rejectUnauthorized: false } : undefined,
      schema: this.config.schema,
    })

    await boss.start()

    for (const name of this.config.queues) {
      await boss.createQueue(name, {
        // Domain (outbound_dispatches) owns backoff — never dual-retry here.
        retryLimit: 0,
      })
    }

    this.#boss = boss
    this.#started = true
  }

  async stop(): Promise<void> {
    if (!this.#boss) return
    await this.#boss.stop({ graceful: true, timeout: 30_000 })
    this.#boss = null
    this.#started = false
  }

  async enqueue(
    name: string,
    data: Record<string, unknown>,
    options?: JobEnqueueOptions
  ): Promise<string | void> {
    const boss = this.#requireBoss()
    const id = await boss.send(name, data, {
      startAfter: options?.runAt,
      singletonKey: options?.singletonKey,
      retryLimit: 0,
    })
    return id ?? undefined
  }

  async work(name: string, handler: JobHandler): Promise<void> {
    const boss = this.#requireBoss()
    // pg-boss v12 delivers a batch; process sequentially for outbound safety.
    await boss.work(name, async (jobs) => {
      for (const job of jobs) {
        await handler({
          id: job.id,
          name,
          data: (job.data ?? {}) as Record<string, unknown>,
        })
      }
    })
  }

  #requireBoss(): PgBoss {
    if (!this.#boss) {
      throw new Error('PgBossJobQueueDriver has not been started')
    }
    return this.#boss
  }
}

export function defaultPgBossQueues(): string[] {
  return [
    JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
    JOB_NAMES.WHATSAPP_UNMATCHED_RECEIPTS_CLEANUP,
    JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS,
  ]
}
