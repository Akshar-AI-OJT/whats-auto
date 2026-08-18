import { test } from '@japa/runner'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { type ConversationAiRepository } from '#repositories/conversation_ai_repository'
import AiDebounceService from '#services/ai/ai_debounce_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import type JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import type TenantRedisStore from '#services/redis/tenant_redis_store'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONTACT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

class InMemoryDebounceStore {
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
}

function createService(params: { isEnabled?: boolean; aiMode?: string; delaySeconds?: number }) {
  const store = new InMemoryDebounceStore()
  const enqueued: Array<{ name: string; data: Record<string, unknown>; options?: unknown }> = []
  const platform = {
    async get() {
      return {
        isEnabled: params.isEnabled ?? true,
        debounceDelaySeconds: params.delaySeconds ?? 4,
      }
    },
  } as unknown as PlatformAiConfigService
  const conversations = {
    async findById() {
      return {
        id: CONV,
        aiMode: params.aiMode ?? ConversationAiMode.AI_AUTO,
        attributedCampaignId: null,
        contactId: CONTACT,
      }
    },
  } as unknown as ConversationAiRepository
  const queue = {
    async ensureStarted() {
      return {
        async enqueue(name: string, data: Record<string, unknown>, options?: unknown) {
          enqueued.push({ name, data, options })
          return 'job-1'
        },
      }
    },
  } as unknown as JobQueueManager

  return {
    store,
    enqueued,
    service: new AiDebounceService(
      store as unknown as TenantRedisStore,
      platform,
      conversations,
      queue
    ),
  }
}

const inbound = {
  organizationId: ORG,
  conversationId: CONV,
  contactId: CONTACT,
  messageId: 'msg-1',
  contentText: 'Hello',
}

test.group('AiDebounceService', () => {
  test('buffers inbound text and enqueues a delayed singleton job', async ({ assert }) => {
    const { service, store, enqueued } = createService({ delaySeconds: 4 })
    await service.scheduleFromInbound(inbound)

    const key = tenantRedisKey('debounce', ORG, CONV)
    assert.lengthOf(store.lists.get(key) ?? [], 1)
    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0]?.name, JOB_NAMES.AI_DEBOUNCE_TURN)
    assert.equal((enqueued[0]?.data as { conversationId: string }).conversationId, CONV)
    const options = enqueued[0]?.options as { singletonKey: string; runAt: Date }
    assert.equal(options.singletonKey, CONV)
    assert.isAbove(options.runAt.getTime(), Date.now())
  })

  test('skips when platform AI is disabled or the conversation is not AI_AUTO', async ({
    assert,
  }) => {
    const disabled = createService({ isEnabled: false })
    await disabled.service.scheduleFromInbound(inbound)
    assert.lengthOf(disabled.enqueued, 0)

    const paused = createService({ aiMode: ConversationAiMode.HANDOVER })
    await paused.service.scheduleFromInbound(inbound)
    assert.lengthOf(paused.enqueued, 0)
  })

  test('three inbound texts replace one delayed job and drain together', async ({ assert }) => {
    const { service, enqueued } = createService({})
    await service.scheduleFromInbound(inbound)
    await service.scheduleFromInbound({ ...inbound, messageId: 'msg-2', contentText: 'Hours?' })
    await service.scheduleFromInbound({ ...inbound, messageId: 'msg-3', contentText: 'Price?' })

    assert.lengthOf(enqueued, 3)
    assert.equal(
      enqueued.every((item) => (item.options as { singletonKey: string }).singletonKey === CONV),
      true
    )

    const drained = await service.drainBufferedMessages(ORG, CONV)
    assert.deepEqual(
      drained.map((item) => item.content),
      ['Hello', 'Hours?', 'Price?']
    )
    const empty = await service.drainBufferedMessages(ORG, CONV)
    assert.deepEqual(empty, [])
  })
})
