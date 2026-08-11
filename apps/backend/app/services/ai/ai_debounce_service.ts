import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import type { DebounceTurnJobPayload } from '#services/ai/contracts/ai_job_payloads'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { tenantRedisKey } from '#lib/redis/tenant_redis_keys'
import TenantRedisStore from '#services/redis/tenant_redis_store'
import { runWithTenant } from '#services/tenant_context'

export const AI_DEBOUNCE_LIST_TTL_SECONDS = 3600

export type InboundDebounceInput = {
  organizationId: string
  conversationId: string
  contactId: string
  messageId: string
  contentText: string | null
}

export default class AiDebounceService {
  constructor(
    private store?: TenantRedisStore,
    private platform: PlatformAiConfigService = new PlatformAiConfigService(),
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private queue?: JobQueueManager
  ) {}

  async scheduleFromInbound(input: InboundDebounceInput): Promise<void> {
    const content = input.contentText?.trim()
    if (!content) return

    const config = await this.platform.get()
    if (!config.isEnabled) return

    const store = await this.#store()
    const queued = await runWithTenant(input.organizationId, async () => {
      const conversation = await this.conversations.findById({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
      })
      if (!conversation || conversation.aiMode !== ConversationAiMode.AI_AUTO) {
        return false
      }

      const entry = {
        messageId: input.messageId,
        content,
        receivedAt: new Date().toISOString(),
      }
      try {
        await store.rpush(
          tenantRedisKey('debounce', input.organizationId, input.conversationId),
          JSON.stringify(entry),
          AI_DEBOUNCE_LIST_TTL_SECONDS
        )
        return true
      } catch (error) {
        logger.warn(
          {
            organizationId: input.organizationId,
            conversationId: input.conversationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'ai.debounce.buffer_failed'
        )
        return false
      }
    })

    if (!queued) return
    await this.#enqueue(input, config.debounceDelaySeconds)
  }

  async drainBufferedMessages(
    organizationId: string,
    conversationId: string
  ): Promise<DebounceTurnJobPayload['aggregatedMessages']> {
    const store = await this.#store()
    const raw = await store.drain(tenantRedisKey('debounce', organizationId, conversationId))
    return raw.map(parseDebounceEntry).filter((entry) => entry !== null)
  }

  async #enqueue(input: InboundDebounceInput, delaySeconds: number): Promise<void> {
    try {
      const manager = this.queue ?? (await app.container.make(JobQueueManager))
      const driver = await manager.ensureStarted(manager.aiDriverName())
      const payload: DebounceTurnJobPayload = {
        organizationId: input.organizationId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        aggregatedMessages: [],
      }
      await driver.enqueue(
        JOB_NAMES.AI_DEBOUNCE_TURN,
        { ...payload },
        {
          singletonKey: input.conversationId,
          runAt: new Date(Date.now() + delaySeconds * 1000),
        }
      )
    } catch (error) {
      logger.warn(
        {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.debounce.enqueue_failed'
      )
    }
  }

  async #store(): Promise<TenantRedisStore> {
    if (this.store) return this.store
    return app.container.make(TenantRedisStore)
  }
}

function parseDebounceEntry(
  raw: string
): DebounceTurnJobPayload['aggregatedMessages'][number] | null {
  try {
    const value = JSON.parse(raw) as Partial<DebounceTurnJobPayload['aggregatedMessages'][number]>
    if (typeof value.messageId !== 'string' || typeof value.content !== 'string') return null
    if (typeof value.receivedAt !== 'string') return null
    const content = value.content.trim()
    if (!content) return null
    return {
      messageId: value.messageId,
      content,
      receivedAt: value.receivedAt,
    }
  } catch {
    return null
  }
}
