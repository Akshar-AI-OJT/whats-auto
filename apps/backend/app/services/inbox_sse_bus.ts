import type { Redis } from 'ioredis'
import logger from '@adonisjs/core/services/logger'
import { createRedisConnection } from '#lib/redis/create_redis_connection'
import {
  inboxEventsHub,
  type InboxSseEvent,
  type InboxSseEventType,
} from '#services/inbox_events_hub'

export const INBOX_SSE_REDIS_CHANNEL = 'wa:inbox:sse'

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
])

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

export default class InboxSseBus {
  #publisher: Redis | null = null
  #subscriber: Redis | null = null
  #started = false

  constructor(
    private readonly redisUrl: string,
    private readonly isWorker: boolean
  ) {}

  get usesRedis(): boolean {
    return this.redisUrl.length > 0
  }

  publish(event: InboxSseEvent): void {
    if (!this.usesRedis) {
      inboxEventsHub.publish(event)
      return
    }

    void this.#publishToRedis(event)
  }

  async start(): Promise<void> {
    if (!this.usesRedis || this.isWorker || this.#started) return

    this.#subscriber = createRedisConnection(this.redisUrl)
    this.#subscriber.on('message', (channel, message) => {
      if (channel !== INBOX_SSE_REDIS_CHANNEL) return
      this.#forwardRedisMessage(message)
    })

    await this.#subscriber.connect()
    await this.#subscriber.subscribe(INBOX_SSE_REDIS_CHANNEL)
    this.#started = true
  }

  async stop(): Promise<void> {
    const clients = [this.#publisher, this.#subscriber].filter(Boolean) as Redis[]
    this.#publisher = null
    this.#subscriber = null
    this.#started = false

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

  async #publishToRedis(event: InboxSseEvent): Promise<void> {
    try {
      if (!this.#publisher) {
        this.#publisher = createRedisConnection(this.redisUrl)
        await this.#publisher.connect()
      }
      await this.#publisher.publish(INBOX_SSE_REDIS_CHANNEL, JSON.stringify(event))
    } catch (error) {
      logger.warn(
        {
          type: event.type,
          organizationId: event.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'inbox.sse_bus_publish_failed'
      )
    }
  }

  #forwardRedisMessage(message: string): void {
    try {
      const parsed: unknown = JSON.parse(message)
      if (!isBusEvent(parsed)) {
        logger.warn({ messageLength: message.length }, 'inbox.sse_bus_invalid_message')
        return
      }
      inboxEventsHub.publish(parsed)
    } catch (error) {
      logger.warn(
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
