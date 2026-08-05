import type { ApplicationService } from '@adonisjs/core/types'
import JobQueueManager from '#services/job_queue/job_queue_manager'

/**
 * Binds JobQueueManager. Does not start consumers — only the worker entrypoint does.
 */
export default class JobQueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(JobQueueManager, () => new JobQueueManager(this.app))
  }

  async shutdown() {
    try {
      const manager = await this.app.container.make(JobQueueManager)
      await manager.stop()
    } catch {
      // Binding may be unavailable during early abort.
    }
  }
}
