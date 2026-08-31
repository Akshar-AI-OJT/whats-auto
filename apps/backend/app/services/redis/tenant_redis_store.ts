import type { Redis } from 'ioredis'
import { createRedisConnection } from '#lib/redis/create_redis_connection'
import { assertTenantRedisKey } from '#lib/redis/tenant_redis_keys'

/**
 * List/TTL/string helper for flow inbound buffer, memory working-set, and exact answer cache.
 * Callers must pass keys from tenantRedisKey() or tenantAnswerCacheKey() — other prefixes are rejected.
 */
export default class TenantRedisStore {
  #client: Redis | null = null

  constructor(private redisUrl: string) {}

  async rpush(key: string, value: string, ttlSeconds?: number): Promise<void> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    const pipeline = client.pipeline()
    pipeline.rpush(key, value)
    if (ttlSeconds !== undefined) {
      pipeline.expire(key, ttlSeconds)
    }
    await pipeline.exec()
  }

  async lrange(key: string): Promise<string[]> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    return client.lrange(key, 0, -1)
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    await client.ltrim(key, start, stop)
  }

  async del(key: string): Promise<void> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    await client.del(key)
  }

  async drain(key: string): Promise<string[]> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    const results = await client.multi().lrange(key, 0, -1).del(key).exec()
    const range = results?.[0]?.[1]
    return Array.isArray(range) ? (range as string[]) : []
  }

  async get(key: string): Promise<string | null> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    return client.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    if (ttlSeconds === undefined) {
      await client.set(key, value)
      return
    }
    await client.set(key, value, 'EX', ttlSeconds)
  }

  /**
   * Atomic INCR with TTL set only when the key is first created (value === 1).
   */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    const value = await client.incr(key)
    if (value === 1) {
      await client.expire(key, ttlSeconds)
    }
    return value
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    assertTenantRedisKey(key)
    const client = await this.#connect()
    await client.expire(key, ttlSeconds)
  }

  async stop(): Promise<void> {
    if (!this.#client) return
    this.#client.disconnect()
    this.#client = null
  }

  async #connect(): Promise<Redis> {
    if (!this.redisUrl) {
      throw new Error('TenantRedisStore requires REDIS_URL')
    }
    if (!this.#client) {
      this.#client = createRedisConnection(this.redisUrl)
      await this.#client.connect()
    }
    return this.#client
  }
}
