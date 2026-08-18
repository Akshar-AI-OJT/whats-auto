import { createHash } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { tenantAnswerCacheKey } from '#lib/redis/tenant_redis_keys'
import { normalizeAnswerCacheQuestion } from '#services/ai/normalize_answer_cache_question'
import TenantRedisStore from '#services/redis/tenant_redis_store'

export const AI_ANSWER_CACHE_TTL_SECONDS = 24 * 60 * 60

export type AnswerCacheLookup = {
  organizationId: string
  question: string
  embeddingSpaceId: string
}

type AnswerCacheStore = Pick<TenantRedisStore, 'get' | 'set'>

/**
 * Exact Q→A cache. Key is org + active embedding space + SHA-256 of the
 * normalized question. Value is the last AUTO_REPLIED WhatsApp text.
 */
export default class AiAnswerCacheService {
  constructor(private store?: AnswerCacheStore) {}

  async get(lookup: AnswerCacheLookup): Promise<string | null> {
    const key = this.#key(lookup)
    if (!key) return null

    try {
      const store = await this.#store()
      const value = await store.get(key)
      const text = value?.trim()
      return text ? text : null
    } catch (error) {
      logger.warn(
        {
          organizationId: lookup.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.answer_cache.get_failed'
      )
      return null
    }
  }

  async set(lookup: AnswerCacheLookup, answer: string): Promise<void> {
    const text = answer.trim()
    if (!text) return
    const key = this.#key(lookup)
    if (!key) return

    try {
      const store = await this.#store()
      await store.set(key, text, AI_ANSWER_CACHE_TTL_SECONDS)
    } catch (error) {
      logger.warn(
        {
          organizationId: lookup.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.answer_cache.set_failed'
      )
    }
  }

  #key(lookup: AnswerCacheLookup): string | null {
    const question = normalizeAnswerCacheQuestion(lookup.question)
    if (!question) return null
    const questionHash = createHash('sha256').update(question, 'utf8').digest('hex')
    try {
      return tenantAnswerCacheKey(lookup.organizationId, lookup.embeddingSpaceId, questionHash)
    } catch {
      return null
    }
  }

  async #store(): Promise<AnswerCacheStore> {
    if (this.store) return this.store
    return app.container.make(TenantRedisStore)
  }
}
