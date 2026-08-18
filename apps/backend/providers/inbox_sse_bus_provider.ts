import type { ApplicationService } from '@adonisjs/core/types'
import { initInboxSseBus, inboxSseBus } from '#services/inbox_sse_bus'

/**
 * Cross-process inbox SSE bridge via Redis pub/sub.
 * API subscribes and forwards to the local InboxEventsHub; worker publishes only.
 */
export default class InboxSseBusProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    const environment = this.app.getEnvironment()
    const redisUrl = environment === 'test' ? '' : this.app.config.get<string>('redis.url', '')
    const isWorker = process.env.JOB_QUEUE_WORKER === '1'
    initInboxSseBus(redisUrl, isWorker)
  }

  async boot() {
    await inboxSseBus.start()
  }

  async shutdown() {
    await inboxSseBus.stop()
  }
}
