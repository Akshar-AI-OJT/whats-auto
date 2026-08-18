import { test } from '@japa/runner'
import {
  assertTenantRedisKey,
  tenantAnswerCacheKey,
  tenantRedisKey,
} from '#lib/redis/tenant_redis_keys'

const ORG = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const SPACE = 'openai:text-embedding-3-small:1024:v1'
const HASH = 'a'.repeat(64)

test.group('tenantRedisKey', () => {
  test('builds org-scoped debounce and memory keys', ({ assert }) => {
    assert.equal(tenantRedisKey('debounce', ORG, CONV), `wa:org:${ORG}:debounce:${CONV}`)
    assert.equal(tenantRedisKey('memory', ORG, CONV), `wa:org:${ORG}:memory:${CONV}`)
  })

  test('builds an org-scoped answer-cache key with space and question hash', ({ assert }) => {
    assert.equal(tenantAnswerCacheKey(ORG, SPACE, HASH), `wa:org:${ORG}:answer:${SPACE}:${HASH}`)
  })

  test('rejects non-uuid segments', ({ assert }) => {
    assert.throws(() => tenantRedisKey('debounce', 'org-1', CONV), /organizationId/)
    assert.throws(() => tenantRedisKey('memory', ORG, 'conv-1'), /conversationId/)
    assert.throws(() => tenantAnswerCacheKey('org-1', SPACE, HASH), /organizationId/)
  })

  test('rejects a malformed embedding space or question hash', ({ assert }) => {
    assert.throws(() => tenantAnswerCacheKey(ORG, 'bad space', HASH), /embeddingSpaceId/)
    assert.throws(() => tenantAnswerCacheKey(ORG, SPACE, 'not-a-hash'), /questionHash/)
  })

  test('assertTenantRedisKey rejects keys outside the tenant prefix', ({ assert }) => {
    assert.throws(() => assertTenantRedisKey('debounce:x'), /Refusing Redis key/)
    assert.doesNotThrow(() => assertTenantRedisKey(tenantRedisKey('debounce', ORG, CONV)))
    assert.doesNotThrow(() => assertTenantRedisKey(tenantAnswerCacheKey(ORG, SPACE, HASH)))
  })
})
