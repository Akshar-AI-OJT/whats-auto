import { LlmChatProvider } from '#enums/llm_chat_provider'
import LlmException from '#exceptions/llm_exception'
import type {
  ChatLlmProvider,
  EmbeddingLlmProvider,
  LlmProvider,
} from '#services/ai/contracts/llm_provider'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import GoogleLlmProvider from '#services/ai/drivers/google_llm_provider'
import MistralLlmProvider from '#services/ai/drivers/mistral_llm_provider'
import OpenAiLlmProvider from '#services/ai/drivers/openai_llm_provider'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import env from '#start/env'

export function providerNameForRole(
  config: { chatProvider: LlmChatProvider; embeddingProvider: LlmChatProvider },
  role: 'chat' | 'embedding'
): LlmChatProvider {
  return role === 'embedding' ? config.embeddingProvider : config.chatProvider
}

/**
 * Config-driven LLM factory. NODE_ENV=test always returns FakeLlmProvider.
 * Chat and embedding drivers are resolved per call from platform config.
 */
export default class LlmProviderFactory {
  constructor(private platform: PlatformAiConfigService) {}

  async createCombined(): Promise<LlmProvider> {
    return this.driverFor(await this.#providerName('chat'))
  }

  async createChat(): Promise<ChatLlmProvider> {
    return this.driverFor(await this.#providerName('chat'))
  }

  async createEmbedding(): Promise<EmbeddingLlmProvider> {
    return this.driverFor(await this.#providerName('embedding'))
  }

  async createEmbeddingFor(provider: LlmChatProvider): Promise<EmbeddingLlmProvider> {
    if (env.get('NODE_ENV') === 'test') return this.driverFor('fake')
    return this.driverFor(provider)
  }

  driverFor(name: LlmChatProvider | 'fake'): LlmProvider {
    if (name === 'fake') return new FakeLlmProvider()
    if (name === LlmChatProvider.Openai) {
      return new OpenAiLlmProvider({ apiKey: env.get('OPENAI_API_KEY')?.release() })
    }
    if (name === LlmChatProvider.Google) {
      return new GoogleLlmProvider({ apiKey: env.get('GOOGLE_AI_API_KEY')?.release() })
    }
    if (name === LlmChatProvider.Mistral) {
      return new MistralLlmProvider({ apiKey: env.get('MISTRAL_API_KEY')?.release() })
    }
    throw LlmException.unsupportedProvider(String(name))
  }

  async #providerName(role: 'chat' | 'embedding'): Promise<LlmChatProvider | 'fake'> {
    if (env.get('NODE_ENV') === 'test') return 'fake'
    const config = await this.platform.get()
    return providerNameForRole(config, role)
  }
}
