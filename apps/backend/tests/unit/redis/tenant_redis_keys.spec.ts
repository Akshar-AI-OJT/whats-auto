import { test } from '@japa/runner'
import { assertTenantRedisKey, tenantRedisKey } from '#lib/redis/tenant_redis_keys'

const ORG = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

test.group('tenantRedisKey', () => {
  test('builds org-scoped debounce and memory keys', ({ assert }) => {
    assert.equal(tenantRedisKey('debounce', ORG, CONV), `wa:org:${ORG}:debounce:${CONV}`)
    assert.equal(tenantRedisKey('memory', ORG, CONV), `wa:org:${ORG}:memory:${CONV}`)
  })

  test('rejects non-uuid segments', ({ assert }) => {
    assert.throws(() => tenantRedisKey('debounce', 'org-1', CONV), /organizationId/)
    assert.throws(() => tenantRedisKey('memory', ORG, 'conv-1'), /conversationId/)
  })

  test('assertTenantRedisKey rejects keys outside the tenant prefix', ({ assert }) => {
    assert.throws(() => assertTenantRedisKey('debounce:x'), /Refusing Redis key/)
    assert.doesNotThrow(() => assertTenantRedisKey(tenantRedisKey('debounce', ORG, CONV)))
  })
})
