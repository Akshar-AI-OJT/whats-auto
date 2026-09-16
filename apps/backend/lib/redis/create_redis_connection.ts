import { Redis, type RedisOptions } from 'ioredis'

const DEFAULT_RECONNECT_CAP_MS = 30_000

export type CreateRedisConnectionOptions = {
  /** Override ioredis reconnect delay. Return null to stop retrying. */
  retryStrategy?: RedisOptions['retryStrategy']
  /** Fail the initial connect attempt after this many ms. */
  connectTimeout?: number
}

/**
 * Shared ioredis factory. BullMQ workers require maxRetriesPerRequest: null.
 * Always attaches an `error` listener so connection failures never become
 * unhandled EventEmitter errors that take down the process.
 */
export function createRedisConnection(url: string, options?: CreateRedisConnectionOptions): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: options?.connectTimeout,
    retryStrategy:
      options?.retryStrategy ??
      ((times: number) => Math.min(Math.max(times, 1) * 200, DEFAULT_RECONNECT_CAP_MS)),
  })

  // Prevent unhandled 'error' from crashing the process. Callers still see
  // command/connect rejections and may attach their own listeners.
  client.on('error', () => {})

  return client
}
