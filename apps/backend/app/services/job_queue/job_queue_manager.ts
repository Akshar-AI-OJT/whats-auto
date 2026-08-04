import type { ApplicationService } from '@adonisjs/core/types'
import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import PgBossJobQueueDriver, {
  defaultPgBossQueues,
} from '#services/job_queue/drivers/pg_boss_driver'

/**
 * Resolves the configured job-queue driver (pgboss | null).
 * Cache one instance per driver name for the process lifetime.
 */
export default class JobQueueManager {
  #drivers = new Map<string, JobQueueDriver>()
  #started = new Set<string>()

  constructor(protected app: ApplicationService) {}

  use(name?: string): JobQueueDriver {
    const driverName = name ?? this.#defaultName()

    let driver = this.#drivers.get(driverName)
    if (!driver) {
      driver = this.#createDriver(driverName)
      this.#drivers.set(driverName, driver)
    }
    return driver
  }

  /**
   * Start the driver if needed (HTTP enqueue path and worker both use this).
   * Does not register consumers — call `work` separately in the worker process.
   */
  async ensureStarted(name?: string): Promise<JobQueueDriver> {
    const driverName = name ?? this.#defaultName()
    const driver = this.use(driverName)
    if (!this.#started.has(driverName)) {
      await driver.start()
      this.#started.add(driverName)
    }
    return driver
  }

  async start(name?: string): Promise<JobQueueDriver> {
    return this.ensureStarted(name)
  }

  async stop(): Promise<void> {
    for (const driver of this.#drivers.values()) {
      await driver.stop()
    }
    this.#drivers.clear()
    this.#started.clear()
  }

  flush(): void {
    this.#drivers.clear()
    this.#started.clear()
  }

  #defaultName(): string {
    return this.app.config.get<string>('job_queue.default', 'null')
  }

  #createDriver(name: string): JobQueueDriver {
    switch (name) {
      case 'null':
        return new NullJobQueueDriver()
      case 'pgboss': {
        const schema = this.app.config.get<string>('job_queue.drivers.pgboss.schema', 'pgboss')
        const queues =
          this.app.config.get<string[]>('job_queue.drivers.pgboss.queues') ?? defaultPgBossQueues()
        return new PgBossJobQueueDriver({ schema, queues })
      }
      default:
        throw new Error(
          `Unknown job queue driver "${name}". Supported: pgboss, null (redis reserved for later).`
        )
    }
  }
}
