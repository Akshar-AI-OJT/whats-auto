import { test } from '@japa/runner'
import { createRedisConnection } from '#lib/redis/create_redis_connection'
import { inboxEventsHub } from '#services/inbox_events_hub'
import InboxSseBus, { assertInboxSseRedisForProduction } from '#services/inbox_sse_bus'

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'

async function redisAvailable(): Promise<boolean> {
  const client = createRedisConnection(REDIS_URL)
  client.options.connectTimeout = 2000
  client.options.maxRetriesPerRequest = 1
  client.options.retryStrategy = () => null
  try {
    await client.connect()
    await client.ping()
    await client.quit()
    return true
  } catch {
    try {
      client.disconnect()
    } catch {
      // ignore
    }
    return false
  }
}

const REDIS_OK = await redisAvailable()

function waitForChunks(chunks: string[], minCount: number, timeoutMs = 3000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (chunks.length >= minCount) {
        resolve()
        return
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Expected at least ${minCount} chunks, got ${chunks.length}`))
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}

test.group('InboxSseBus without Redis', () => {
  test('publish delivers to local hub subscribers with org isolation', ({ assert }) => {
    const bus = new InboxSseBus('', false)
    const forA: string[] = []
    const forB: string[] = []
    const unsubA = inboxEventsHub.subscribe({
      organizationId: ORG_A,
      write: (chunk) => forA.push(chunk),
      close: () => {},
    })
    const unsubB = inboxEventsHub.subscribe({
      organizationId: ORG_B,
      write: (chunk) => forB.push(chunk),
      close: () => {},
    })

    try {
      bus.publish({
        type: 'ai.generation.started',
        organizationId: ORG_A,
        payload: { conversationId: CONV, promptAt: '2026-08-11T12:00:00.000Z' },
      })
      bus.publish({
        type: 'ai.handover.triggered',
        organizationId: ORG_B,
        payload: { conversationId: CONV, reason: 'keyword_match', matchedKeyword: 'agent' },
      })

      assert.lengthOf(forA, 1)
      assert.include(forA[0]!, 'ai.generation.started')
      assert.lengthOf(forB, 1)
      assert.include(forB[0]!, 'ai.handover.triggered')
    } finally {
      unsubA()
      unsubB()
    }
  })

  test('assertInboxSseRedisForProduction throws only in production without URL', ({ assert }) => {
    assert.doesNotThrow(() => assertInboxSseRedisForProduction('', 'development'))
    assert.doesNotThrow(() => assertInboxSseRedisForProduction('', 'test'))
    assert.doesNotThrow(() =>
      assertInboxSseRedisForProduction('redis://localhost:6379', 'production')
    )
    assert.throws(
      () => assertInboxSseRedisForProduction('', 'production'),
      /REDIS_URL is required in production/
    )
  })
})

test.group('InboxSseBus with Redis', () => {
  test('worker publish reaches API subscriber and hub with org isolation', async ({ assert }) => {
    const workerBus = new InboxSseBus(REDIS_URL, true)
    const apiBus = new InboxSseBus(REDIS_URL, false)
    const forA: string[] = []
    const forB: string[] = []
    const unsubA = inboxEventsHub.subscribe({
      organizationId: ORG_A,
      write: (chunk) => forA.push(chunk),
      close: () => {},
    })
    const unsubB = inboxEventsHub.subscribe({
      organizationId: ORG_B,
      write: (chunk) => forB.push(chunk),
      close: () => {},
    })

    try {
      await apiBus.start()
      workerBus.publish({
        type: 'ai.handover.triggered',
        organizationId: ORG_A,
        payload: { conversationId: CONV, reason: 'keyword_match', matchedKeyword: 'agent' },
      })

      await waitForChunks(forA, 1)
      assert.include(forA[0]!, 'ai.handover.triggered')
      assert.lengthOf(forB, 0)
    } finally {
      unsubA()
      unsubB()
      await workerBus.stop()
      await apiBus.stop()
    }
  }).skip(!REDIS_OK, 'Redis is not available')

  test('ignores malformed Redis messages without throwing', async ({ assert }) => {
    const apiBus = new InboxSseBus(REDIS_URL, false)
    const publisher = createRedisConnection(REDIS_URL)
    const forA: string[] = []
    const unsubA = inboxEventsHub.subscribe({
      organizationId: ORG_A,
      write: (chunk) => forA.push(chunk),
      close: () => {},
    })

    try {
      await apiBus.start()
      await publisher.connect()
      await publisher.publish('wa:inbox:sse', '{not-json')
      await publisher.publish(
        'wa:inbox:sse',
        JSON.stringify({ type: 'invalid.type', organizationId: ORG_A })
      )
      await publisher.publish('wa:inbox:sse', JSON.stringify({ type: 'ai.handover.triggered' }))

      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.lengthOf(forA, 0)
    } finally {
      unsubA()
      publisher.disconnect()
      await apiBus.stop()
    }
  }).skip(!REDIS_OK, 'Redis is not available')
})
