import type { ApplicationService } from '@adonisjs/core/types'
import TenantRedisStore from '#services/redis/tenant_redis_store'

/**
 * Binds TenantRedisStore. Does not connect until the first command.
 */
export default class RedisProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(TenantRedisStore, () => {
      const url = this.app.config.get<string>('redis.url', '')
      return new TenantRedisStore(url)
    })
  }

  async shutdown() {
    try {
      const store = await this.app.container.make(TenantRedisStore)
      await store.stop()
    } catch {
      // Binding may be unavailable during early abort.
    }
  }
}
