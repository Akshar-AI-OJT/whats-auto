import type { ApplicationService } from '@adonisjs/core/types'
import {
  ChatLlmProvider,
  EmbeddingLlmProvider,
  LlmProvider,
} from '#services/ai/contracts/llm_provider'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import LlmProviderFactory from '#services/ai/llm_provider_factory'
import PassthroughRerankerService from '#services/ai/drivers/passthrough_reranker_service'
import RedisMemoryWorkingSetService from '#services/ai/redis_memory_working_set_service'
import TenantRedisStore from '#services/redis/tenant_redis_store'

/**
 * Platform AI config, LLM driver, memory working-set, and the deferred passthrough reranker.
 */
export default class AiProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(PlatformAiConfigService, () => new PlatformAiConfigService())
    this.app.container.singleton(LlmProviderFactory, async (resolver) => {
      return new LlmProviderFactory(await resolver.make(PlatformAiConfigService))
    })
    this.app.container.bind(ChatLlmProvider, async (resolver) => {
      const factory = await resolver.make(LlmProviderFactory)
      return factory.createChat()
    })
    this.app.container.bind(EmbeddingLlmProvider, async (resolver) => {
      const factory = await resolver.make(LlmProviderFactory)
      return factory.createEmbedding()
    })
    this.app.container.bind(LlmProvider, async (resolver) => {
      const factory = await resolver.make(LlmProviderFactory)
      return factory.createCombined()
    })
    this.app.container.singleton(PassthroughRerankerService, () => new PassthroughRerankerService())
    this.app.container.singleton(MemoryWorkingSetService, async (resolver) => {
      return new RedisMemoryWorkingSetService(await resolver.make(TenantRedisStore))
    })
  }
}
