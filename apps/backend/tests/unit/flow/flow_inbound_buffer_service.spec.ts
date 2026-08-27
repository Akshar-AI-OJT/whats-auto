import { test } from '@japa/runner'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import FlowInboundBufferService from '#services/flow/flow_inbound_buffer_service'
import type TenantRedisStore from '#services/redis/tenant_redis_store'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class InMemoryStore {
  lists = new Map<string, string[]>()

  async rpush(key: string, value: string): Promise<void> {
    const list = this.lists.get(key) ?? []
    list.push(value)
    this.lists.set(key, list)
  }

  async drain(key: string): Promise<string[]> {
    const list = this.lists.get(key) ?? []
    this.lists.delete(key)
    return list
  }

  async del(key: string): Promise<void> {
    this.lists.delete(key)
  }
}

test.group('FlowInboundBufferService', () => {
  test('pushes trimmed text and drains in order', async ({ assert }) => {
    const store = new InMemoryStore()
    const buffer = new FlowInboundBufferService(store as unknown as TenantRedisStore)

    await buffer.push({
      organizationId: ORG,
      conversationId: CONV,
      messageId: 'msg-1',
      content: '  Hello  ',
    })
    await buffer.push({
      organizationId: ORG,
      conversationId: CONV,
      messageId: 'msg-2',
      content: 'Hours?',
    })

    const key = tenantRedisKey('flowbuf', ORG, CONV)
    assert.lengthOf(store.lists.get(key) ?? [], 2)

    const drained = await buffer.drain({ organizationId: ORG, conversationId: CONV })
    assert.deepEqual(
      drained.map((entry) => entry.content),
      ['Hello', 'Hours?']
    )
    assert.isUndefined(store.lists.get(key))
  })

  test('skips blank content and cancel clears the list', async ({ assert }) => {
    const store = new InMemoryStore()
    const buffer = new FlowInboundBufferService(store as unknown as TenantRedisStore)

    const blank = await buffer.push({
      organizationId: ORG,
      conversationId: CONV,
      messageId: 'msg-blank',
      content: '   ',
    })
    assert.isFalse(blank)

    await buffer.push({
      organizationId: ORG,
      conversationId: CONV,
      messageId: 'msg-1',
      content: 'keep',
    })
    await buffer.cancel({ organizationId: ORG, conversationId: CONV })

    const drained = await buffer.drain({ organizationId: ORG, conversationId: CONV })
    assert.lengthOf(drained, 0)
  })
})
