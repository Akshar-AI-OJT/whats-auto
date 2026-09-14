import { test } from '@japa/runner'
import { type MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import type { MemoryTurn } from '#services/ai/contracts/memory_working_set_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import RedisMemoryWorkingSetService from '#services/ai/redis_memory_working_set_service'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class InMemoryListStore {
  lists = new Map<string, string[]>()
  failNext = false

  async rpush(key: string, value: string): Promise<void> {
    this.#maybeFail()
    const list = this.lists.get(key) ?? []
    list.push(value)
    this.lists.set(key, list)
  }

  async lrange(key: string): Promise<string[]> {
    this.#maybeFail()
    return [...(this.lists.get(key) ?? [])]
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    this.#maybeFail()
    const list = this.lists.get(key) ?? []
    const len = list.length
    const from = start < 0 ? len + start : start
    const to = stop < 0 ? len + stop : stop
    this.lists.set(key, list.slice(Math.max(0, from), Math.max(0, to + 1)))
  }

  async del(key: string): Promise<void> {
    this.#maybeFail()
    this.lists.delete(key)
  }

  #maybeFail() {
    if (!this.failNext) return
    this.failNext = false
    throw new Error('redis down')
  }
}

function turn(role: MemoryTurn['role'], content: string, messageId: string): MemoryTurn {
  return {
    role,
    content,
    timestamp: '2026-08-11T12:00:00.000Z',
    messageId,
  }
}

function createService(params?: {
  store?: InMemoryListStore
  fallback?: MemoryTurn[]
  workingSetSize?: number
}) {
  const store = params?.store
  const messages = {
    async listRecentTurns() {
      return params?.fallback ?? []
    },
  } as unknown as MemoryWorkingSetRepository
  const platform = {
    async get() {
      return { workingSetSize: params?.workingSetSize ?? 2 }
    },
  } as unknown as PlatformAiConfigService

  return {
    store,
    service: new RedisMemoryWorkingSetService(store, messages, platform),
  }
}

test.group('RedisMemoryWorkingSetService', () => {
  test('appends, gets last N, and clears the Redis list', async ({ assert }) => {
    const store = new InMemoryListStore()
    const { service } = createService({ store, workingSetSize: 2 })

    await service.appendTurn(ORG, CONV, turn('user', 'hi', 'm1'))
    await service.appendTurn(ORG, CONV, turn('assistant', 'hello', 'm2'))
    await service.appendTurn(ORG, CONV, turn('user', 'hours?', 'm3'))

    const recent = await service.getRecentTurns(ORG, CONV)
    assert.deepEqual(
      recent.map((item) => item.content),
      ['hello', 'hours?']
    )
    assert.equal(store.lists.get(tenantRedisKey('memory', ORG, CONV))?.length, 2)

    await service.clearWorkingSet(ORG, CONV)
    assert.isUndefined(store.lists.get(tenantRedisKey('memory', ORG, CONV)))
  })

  test('falls back to messages after a Redis flush', async ({ assert }) => {
    const store = new InMemoryListStore()
    const { service } = createService({
      store,
      fallback: [turn('user', 'from-db', 'db-1')],
    })

    await service.appendTurn(ORG, CONV, turn('user', 'cached', 'm1'))
    const cached = await service.getRecentTurns(ORG, CONV)
    assert.equal(cached[0]?.content, 'cached')

    await service.clearWorkingSet(ORG, CONV)
    const fallback = await service.getRecentTurns(ORG, CONV)
    assert.equal(fallback[0]?.content, 'from-db')
  })

  test('falls back to messages when Redis throws', async ({ assert }) => {
    const store = new InMemoryListStore()
    store.failNext = true
    const { service } = createService({
      store,
      fallback: [turn('assistant', 'db-ok', 'db-2')],
    })

    const recent = await service.getRecentTurns(ORG, CONV)
    assert.equal(recent[0]?.content, 'db-ok')
  })

  test('skips empty appends and corrupt Redis entries', async ({ assert }) => {
    const store = new InMemoryListStore()
    const { service } = createService({ store })
    await service.appendTurn(ORG, CONV, turn('user', '   ', 'empty'))

    const key = tenantRedisKey('memory', ORG, CONV)
    store.lists.set(key, ['not-json', JSON.stringify({ role: 'user' })])
    store.lists.get(key)!.push(JSON.stringify(turn('user', 'ok', 'm1')))

    const recent = await service.getRecentTurns(ORG, CONV)
    assert.deepEqual(
      recent.map((item) => item.content),
      ['ok']
    )
  })
})
