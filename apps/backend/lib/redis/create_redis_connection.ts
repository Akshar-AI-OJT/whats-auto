import { Redis } from 'ioredis'

/**
 * Shared ioredis factory. BullMQ workers require maxRetriesPerRequest: null.
 */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  })
}
