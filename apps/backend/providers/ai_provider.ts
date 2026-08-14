import type { ApplicationService } from '@adonisjs/core/types'
import { LlmProvider } from '#services/ai/contracts/llm_provider'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import { createLlmProviderFromEnv } from '#services/ai/create_llm_provider_from_env'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import PassthroughRerankerService from '#services/ai/drivers/passthrough_reranker_service'
import AiDebounceService from '#services/ai/ai_debounce_service'
import RedisMemoryWorkingSetService from '#services/ai/redis_memory_working_set_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import TenantRedisStore from '#services/redis/tenant_redis_store'

/**
 * Platform AI config, LLM driver, memory working-set, and the deferred passthrough reranker.
 */
export default class AiProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(PlatformAiConfigService, () => new PlatformAiConfigService())
    this.app.container.singleton(LlmProvider, () => createLlmProviderFromEnv())
    this.app.container.singleton(PassthroughRerankerService, () => new PassthroughRerankerService())
    this.app.container.singleton(MemoryWorkingSetService, async (resolver) => {
      return new RedisMemoryWorkingSetService(await resolver.make(TenantRedisStore))
    })
    this.app.container.singleton(AiDebounceService, async (resolver) => {
      return new AiDebounceService(
        await resolver.make(TenantRedisStore),
        await resolver.make(PlatformAiConfigService),
        new ConversationAiRepository(),
        await resolver.make(JobQueueManager)
      )
    })
  }
}
