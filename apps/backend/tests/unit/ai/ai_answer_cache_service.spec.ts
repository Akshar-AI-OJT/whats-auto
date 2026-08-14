import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import AiAnswerCacheService from '#services/ai/ai_answer_cache_service'
import { normalizeAnswerCacheQuestion } from '#services/ai/normalize_answer_cache_question'
import { tenantAnswerCacheKey } from '#lib/redis/tenant_redis_keys'
import type TenantRedisStore from '#services/redis/tenant_redis_store'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SPACE = 'openai:text-embedding-3-small:1024:v1'
const OTHER_SPACE = 'mistral:mistral-embed:1024:v1'

class InMemoryStringStore {
  values = new Map<string, string>()
  ttls = new Map<string, number>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.values.set(key, value)
    if (ttlSeconds !== undefined) this.ttls.set(key, ttlSeconds)
  }
}

function hashQuestion(question: string): string {
  return createHash('sha256').update(normalizeAnswerCacheQuestion(question), 'utf8').digest('hex')
}

test.group('normalizeAnswerCacheQuestion', () => {
  test('trims, lowercases, and collapses whitespace', ({ assert }) => {
    assert.equal(normalizeAnswerCacheQuestion('  What ARE   your hours? '), 'what are your hours?')
  })
})

test.group('AiAnswerCacheService', () => {
  test('stores AUTO_REPLIED text under org + space + normalized question', async ({ assert }) => {
    const redis = new InMemoryStringStore()
    const cache = new AiAnswerCacheService(redis as unknown as TenantRedisStore)

    await cache.set(
      {
        organizationId: ORG,
        question: '  What ARE   your hours? ',
        embeddingSpaceId: SPACE,
      },
      'We open at 9.'
    )

    const key = tenantAnswerCacheKey(ORG, SPACE, hashQuestion('What ARE your hours?'))
    assert.equal(redis.values.get(key), 'We open at 9.')
    assert.equal(redis.ttls.get(key), 24 * 60 * 60)

    const hit = await cache.get({
      organizationId: ORG,
      question: 'what are your hours?',
      embeddingSpaceId: SPACE,
    })
    assert.equal(hit, 'We open at 9.')
  })

  test('misses when org or embedding space differs', async ({ assert }) => {
    const redis = new InMemoryStringStore()
    const cache = new AiAnswerCacheService(redis as unknown as TenantRedisStore)
    await cache.set(
      { organizationId: ORG, question: 'hours?', embeddingSpaceId: SPACE },
      'We open at 9.'
    )

    assert.isNull(
      await cache.get({
        organizationId: OTHER_ORG,
        question: 'hours?',
        embeddingSpaceId: SPACE,
      })
    )
    assert.isNull(
      await cache.get({
        organizationId: ORG,
        question: 'hours?',
        embeddingSpaceId: OTHER_SPACE,
      })
    )
  })

  test('does not store an empty answer and treats empty stored values as a miss', async ({
    assert,
  }) => {
    const redis = new InMemoryStringStore()
    const cache = new AiAnswerCacheService(redis as unknown as TenantRedisStore)
    await cache.set({ organizationId: ORG, question: 'hours?', embeddingSpaceId: SPACE }, '   ')
    assert.equal(redis.values.size, 0)

    const key = tenantAnswerCacheKey(ORG, SPACE, hashQuestion('hours?'))
    redis.values.set(key, '')
    assert.isNull(
      await cache.get({ organizationId: ORG, question: 'hours?', embeddingSpaceId: SPACE })
    )
  })

  test('swallows store errors and returns a miss', async ({ assert }) => {
    const cache = new AiAnswerCacheService({
      async get() {
        throw new Error('redis down')
      },
      async set() {
        throw new Error('redis down')
      },
    } as unknown as TenantRedisStore)

    assert.isNull(
      await cache.get({ organizationId: ORG, question: 'hours?', embeddingSpaceId: SPACE })
    )
    await cache.set(
      { organizationId: ORG, question: 'hours?', embeddingSpaceId: SPACE },
      'We open at 9.'
    )
  })
})
