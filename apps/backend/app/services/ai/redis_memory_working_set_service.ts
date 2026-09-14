import logger from '@adonisjs/core/services/logger'
import { MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import {
  MemoryWorkingSetService,
  type MemoryTurn,
} from '#services/ai/contracts/memory_working_set_service'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import type TenantRedisStore from '#services/redis/tenant_redis_store'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import { runWithTenant } from '#services/tenant_context'

export const MEMORY_WORKING_SET_TTL_SECONDS = 7 * 24 * 60 * 60

type MemoryListStore = Pick<TenantRedisStore, 'rpush' | 'lrange' | 'ltrim' | 'del'>

export default class RedisMemoryWorkingSetService extends MemoryWorkingSetService {
  constructor(
    private store?: MemoryListStore,
    private messages: MemoryWorkingSetRepository = new MemoryWorkingSetRepository(),
    private platform: PlatformAiConfigService = new PlatformAiConfigService()
  ) {
    super()
  }

  async appendTurn(
    organizationId: string,
    conversationId: string,
    turn: MemoryTurn
  ): Promise<void> {
    const content = turn.content.trim()
    if (!content || !this.store) return

    const limit = await this.#limit()
    const key = tenantRedisKey('memory', organizationId, conversationId)
    const payload: MemoryTurn = {
      role: turn.role,
      content,
      timestamp: turn.timestamp,
      ...(turn.messageId ? { messageId: turn.messageId } : {}),
    }

    try {
      await this.store.rpush(key, JSON.stringify(payload), MEMORY_WORKING_SET_TTL_SECONDS)
      await this.store.ltrim(key, -limit, -1)
    } catch (error) {
      logger.warn(
        {
          organizationId,
          conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.memory.append_failed'
      )
    }
  }

  async getRecentTurns(
    organizationId: string,
    conversationId: string,
    limit?: number
  ): Promise<MemoryTurn[]> {
    const resolvedLimit = limit ?? (await this.#limit())
    if (resolvedLimit <= 0) return []

    const cached = await this.#readRedis(organizationId, conversationId, resolvedLimit)
    if (cached !== null) return cached

    return runWithTenant(organizationId, () =>
      this.messages.listRecentTurns({
        organizationId,
        conversationId,
        limit: resolvedLimit,
      })
    )
  }

  async clearWorkingSet(organizationId: string, conversationId: string): Promise<void> {
    if (!this.store) return
    try {
      await this.store.del(tenantRedisKey('memory', organizationId, conversationId))
    } catch (error) {
      logger.warn(
        {
          organizationId,
          conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.memory.clear_failed'
      )
    }
  }

  async #limit(): Promise<number> {
    const config = await this.platform.get()
    return config.workingSetSize
  }

  async #readRedis(
    organizationId: string,
    conversationId: string,
    limit: number
  ): Promise<MemoryTurn[] | null> {
    if (!this.store) return null

    try {
      const raw = await this.store.lrange(tenantRedisKey('memory', organizationId, conversationId))
      if (raw.length === 0) return null

      const turns = raw
        .map((value) => parseTurn(value))
        .filter((turn): turn is MemoryTurn => turn !== null)
      return turns.slice(-limit)
    } catch (error) {
      logger.warn(
        {
          organizationId,
          conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.memory.read_failed'
      )
      return null
    }
  }
}

function parseTurn(raw: string): MemoryTurn | null {
  try {
    const value = JSON.parse(raw) as Partial<MemoryTurn>
    if (value.role !== 'user' && value.role !== 'assistant') return null
    if (typeof value.content !== 'string' || value.content.trim() === '') return null
    if (typeof value.timestamp !== 'string' || value.timestamp.trim() === '') return null
    return {
      role: value.role,
      content: value.content,
      timestamp: value.timestamp,
      ...(typeof value.messageId === 'string' ? { messageId: value.messageId } : {}),
    }
  } catch {
    return null
  }
}
