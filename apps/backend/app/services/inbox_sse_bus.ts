import type { Redis } from 'ioredis'
import logger from '@adonisjs/core/services/logger'
import { createRedisConnection } from '#lib/redis/create_redis_connection'
import {
  inboxEventsHub,
  type InboxSseEvent,
  type InboxSseEventType,
} from '#services/inbox_events_hub'

export const INBOX_SSE_REDIS_CHANNEL = 'wa:inbox:sse'

/**
 * `@adonisjs/core/services/logger` is assigned only in `app.booted`.
 * Provider `boot()` runs earlier — never call logger methods without a fallback
 * or soft-start will throw and take down the API.
 */
function busLog(level: 'info' | 'warn', payload: Record<string, unknown>, message: string): void {
  try {
    if (logger && typeof logger[level] === 'function') {
      logger[level](payload, message)
      return
    }
  } catch {
    // ignore logger failures
  }
  const line = `[inbox_sse_bus] ${message}`
  if (level === 'warn') {
    console.warn(line, payload)
  } else {
    console.info(line, payload)
  }
}

const BUS_EVENT_TYPES = new Set<InboxSseEventType>([
  'message.received',
  'message.queued',
  'message.sent',
  'message.failed',
  'status.updated',
  'ai.generation.started',
  'ai.token.delta',
  'ai.generation.completed',
  'ai.handover.triggered',
  'conversation.ai_mode.updated',
])

const SUBSCRIBE_CONNECT_TIMEOUT_MS = 2_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_CAP_MS = 30_000

function isBusEvent(value: unknown): value is InboxSseEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    typeof event.type === 'string' &&
    BUS_EVENT_TYPES.has(event.type as InboxSseEventType) &&
    typeof event.organizationId === 'string' &&
    event.organizationId.length > 0 &&
    event.payload !== null &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
  )
}

/**
 * Production web/worker must have REDIS_URL so multi-instance fan-out works.
 * Dev/test may omit Redis and publish directly to the in-process hub.
 * Connection failures at runtime are soft for the API process (see start()).
 */
export function assertInboxSseRedisForProduction(redisUrl: string, nodeEnv: string): void {
  if (nodeEnv === 'production' && !redisUrl.trim()) {
    throw new Error(
      'REDIS_URL is required in production for InboxSseBus (channel wa:inbox:sse). ' +
        'Without Redis, worker-published inbox events never reach API SSE clients.'
    )
  }
}

export default class InboxSseBus {
  #publisher: Redis | null = null
  #subscriber: Redis | null = null
  #started = false
  #stopping = false
  #connectInFlight = false
  #reconnectAttempt = 0
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly redisUrl: string,
    private readonly isWorker: boolean
  ) {}

  get usesRedis(): boolean {
    return this.redisUrl.length > 0
  }

  get isStarted(): boolean {
    return this.#started
  }

  publish(event: InboxSseEvent): void {
    if (!this.usesRedis) {
      inboxEventsHub.publish(event)
      return
    }

    void this.#publishToRedis(event)
  }

  /**
   * Subscribe for cross-process fan-out. Never throws — Redis downtime must not
   * block API boot or non-Redis HTTP (auth, etc.). Retries with backoff until stop().
   */
  async start(): Promise<void> {
    if (!this.usesRedis || this.isWorker || this.#stopping) return
    if (this.#started || this.#connectInFlight) return

    await this.#connectSubscriber()
  }

  async stop(): Promise<void> {
    this.#stopping = true
    this.#clearReconnectTimer()
    this.#started = false

    const clients = [this.#publisher, this.#subscriber].filter(Boolean) as Redis[]
    this.#publisher = null
    this.#subscriber = null

    await Promise.all(
      clients.map(async (client) => {
        try {
          if (client.status === 'ready') {
            await client.unsubscribe(INBOX_SSE_REDIS_CHANNEL)
          }
        } catch {
          // ignore unsubscribe errors during shutdown
        }
        client.disconnect()
      })
    )
  }

  async #connectSubscriber(): Promise<void> {
    if (!this.usesRedis || this.isWorker || this.#stopping || this.#started) return
    if (this.#connectInFlight) return

    this.#connectInFlight = true
    this.#clearReconnectTimer()
    this.#teardownSubscriber()

    const subscriber = createRedisConnection(this.redisUrl, {
      // Own reconnect so a down Redis fails this attempt quickly instead of hanging boot.
      retryStrategy: () => null,
      connectTimeout: SUBSCRIBE_CONNECT_TIMEOUT_MS,
    })
    this.#subscriber = subscriber

    subscriber.on('message', (channel, message) => {
      if (channel !== INBOX_SSE_REDIS_CHANNEL) return
      this.#forwardRedisMessage(message)
    })

    subscriber.on('close', () => {
      if (this.#stopping || this.#subscriber !== subscriber) return
      this.#started = false
      this.#scheduleReconnect()
    })

    try {
      await subscriber.connect()
      await subscriber.subscribe(INBOX_SSE_REDIS_CHANNEL)
      if (this.#stopping || this.#subscriber !== subscriber) {
        subscriber.disconnect()
        return
      }
      this.#started = true
      this.#reconnectAttempt = 0
      busLog('info', { channel: INBOX_SSE_REDIS_CHANNEL }, 'inbox.sse_bus_subscribed')
    } catch (error) {
      this.#started = false
      busLog(
        'warn',
        {
          channel: INBOX_SSE_REDIS_CHANNEL,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'inbox.sse_bus_subscribe_failed'
      )
      if (this.#subscriber === subscriber) {
        this.#teardownSubscriber()
      } else {
        subscriber.disconnect()
      }
      this.#scheduleReconnect()
    } finally {
      this.#connectInFlight = false
    }
  }

  #scheduleReconnect(): void {
    if (this.#stopping || this.isWorker || !this.usesRedis) return
    if (this.#started || this.#connectInFlight || this.#reconnectTimer) return

    this.#reconnectAttempt += 1
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.#reconnectAttempt - 1), RECONNECT_CAP_MS)

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      void this.#connectSubscriber()
    }, delay)
  }

  #clearReconnectTimer(): void {
    if (!this.#reconnectTimer) return
    clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
  }

  #teardownSubscriber(): void {
    const subscriber = this.#subscriber
    this.#subscriber = null
    this.#started = false
    if (!subscriber) return
    try {
      subscriber.removeAllListeners()
      subscriber.disconnect()
    } catch {
      // ignore teardown races
    }
  }

  async #publishToRedis(event: InboxSseEvent): Promise<void> {
    try {
      if (!this.#publisher) {
        this.#publisher = createRedisConnection(this.redisUrl, {
          retryStrategy: () => null,
          connectTimeout: SUBSCRIBE_CONNECT_TIMEOUT_MS,
        })
        await this.#publisher.connect()
      }
      await this.#publisher.publish(INBOX_SSE_REDIS_CHANNEL, JSON.stringify(event))
    } catch (error) {
      busLog(
        'warn',
        {
          type: event.type,
          organizationId: event.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'inbox.sse_bus_publish_failed'
      )
      if (this.#publisher) {
        try {
          this.#publisher.disconnect()
        } catch {
          // ignore
        }
        this.#publisher = null
      }
      // Same-process SSE clients still get the event; other API replicas rely on
      // client reconnect catch-up when Redis is down.
      try {
        inboxEventsHub.publish(event)
      } catch (hubError) {
        busLog(
          'warn',
          {
            type: event.type,
            organizationId: event.organizationId,
            err: hubError instanceof Error ? hubError.message : 'unknown',
          },
          'inbox.sse_bus_hub_fallback_failed'
        )
      }
    }
  }

  #forwardRedisMessage(message: string): void {
    try {
      const parsed: unknown = JSON.parse(message)
      if (!isBusEvent(parsed)) {
        busLog('warn', { messageLength: message.length }, 'inbox.sse_bus_invalid_message')
        return
      }
      inboxEventsHub.publish(parsed)
    } catch (error) {
      busLog(
        'warn',
        {
          err: error instanceof Error ? error.message : 'unknown',
          messageLength: message.length,
        },
        'inbox.sse_bus_forward_failed'
      )
    }
  }
}

function createDefaultBus(): InboxSseBus {
  return new InboxSseBus('', false)
}

export let inboxSseBus: InboxSseBus = createDefaultBus()

export function initInboxSseBus(redisUrl: string, isWorker: boolean): InboxSseBus {
  inboxSseBus = new InboxSseBus(redisUrl, isWorker)
  return inboxSseBus
}
