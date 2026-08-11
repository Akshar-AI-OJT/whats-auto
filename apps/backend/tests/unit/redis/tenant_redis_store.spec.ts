import { test } from '@japa/runner'
import TenantRedisStore from '#services/redis/tenant_redis_store'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'

const ORG = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

test.group('TenantRedisStore', () => {
  test('rejects keys outside the tenant prefix before connecting', async ({ assert }) => {
    const store = new TenantRedisStore('')
    await assert.rejects(() => store.rpush('cache:global', 'x'), /Refusing Redis key/)
    await assert.rejects(() => store.ltrim('cache:global', -1, -1), /Refusing Redis key/)
    await assert.rejects(() => store.drain('cache:global'), /Refusing Redis key/)
  })

  test('requires REDIS_URL for tenant keys', async ({ assert }) => {
    const store = new TenantRedisStore('')
    await assert.rejects(
      () => store.rpush(tenantRedisKey('debounce', ORG, CONV), 'hello'),
      'TenantRedisStore requires REDIS_URL'
    )
  })
})
