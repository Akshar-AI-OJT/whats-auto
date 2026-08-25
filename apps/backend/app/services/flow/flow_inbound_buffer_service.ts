import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import TenantRedisStore from '#services/redis/tenant_redis_store'

/** Same TTL as the retired AI debounce list — abandoned bursts expire. */
export const FLOW_INBOUND_BUFFER_TTL_SECONDS = 3600

export type FlowInboundBufferEntry = {
  messageId: string
  content: string
  receivedAt: string
}

/**
 * Coalesces free-text inbound messages per conversation before flows.advance_session.
 * Interactive replies skip this buffer and enqueue immediately.
 */
export default class FlowInboundBufferService {
  constructor(private store?: TenantRedisStore) {}

  async push(params: {
    organizationId: string
    conversationId: string
    messageId: string
    content: string
  }): Promise<boolean> {
    const content = params.content.trim()
    if (!content) return false

    const entry: FlowInboundBufferEntry = {
      messageId: params.messageId,
      content,
      receivedAt: new Date().toISOString(),
    }

    try {
      const store = await this.#store()
      await store.rpush(
        tenantRedisKey('flowbuf', params.organizationId, params.conversationId),
        JSON.stringify(entry),
        FLOW_INBOUND_BUFFER_TTL_SECONDS
      )
      return true
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.inbound_buffer.push_failed'
      )
      return false
    }
  }

  async drain(params: {
    organizationId: string
    conversationId: string
  }): Promise<FlowInboundBufferEntry[]> {
    try {
      const store = await this.#store()
      const raw = await store.drain(
        tenantRedisKey('flowbuf', params.organizationId, params.conversationId)
      )
      return raw.map(parseEntry).filter((entry): entry is FlowInboundBufferEntry => entry !== null)
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.inbound_buffer.drain_failed'
      )
      return []
    }
  }

  async cancel(params: { organizationId: string; conversationId: string }): Promise<void> {
    try {
      const store = await this.#store()
      await store.del(tenantRedisKey('flowbuf', params.organizationId, params.conversationId))
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.inbound_buffer.cancel_failed'
      )
    }
  }

  async #store(): Promise<TenantRedisStore> {
    if (this.store) return this.store
    return app.container.make(TenantRedisStore)
  }
}

function parseEntry(raw: string): FlowInboundBufferEntry | null {
  try {
    const value = JSON.parse(raw) as Partial<FlowInboundBufferEntry>
    if (typeof value.messageId !== 'string' || typeof value.content !== 'string') return null
    if (typeof value.receivedAt !== 'string') return null
    const content = value.content.trim()
    if (!content) return null
    return {
      messageId: value.messageId,
      content,
      receivedAt: value.receivedAt,
    }
  } catch {
    return null
  }
}
