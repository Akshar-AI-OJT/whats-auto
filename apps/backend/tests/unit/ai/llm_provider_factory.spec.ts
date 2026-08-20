import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import {
  ChatLlmProvider,
  EmbeddingLlmProvider,
  LlmProvider,
} from '#services/ai/contracts/llm_provider'
import LlmException from '#exceptions/llm_exception'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import GoogleLlmProvider from '#services/ai/drivers/google_llm_provider'
import MistralLlmProvider from '#services/ai/drivers/mistral_llm_provider'
import OpenAiLlmProvider from '#services/ai/drivers/openai_llm_provider'
import LlmProviderFactory, { providerNameForRole } from '#services/ai/llm_provider_factory'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'

test.group('LlmProviderFactory', () => {
  test('createCombined returns FakeLlmProvider when NODE_ENV=test', async ({ assert }) => {
    const factory = await app.container.make(LlmProviderFactory)
    const llm = await factory.createCombined()
    assert.instanceOf(llm, FakeLlmProvider)
    assert.isFunction(llm.generateCompletion)
    const chat = await factory.createChat()
    const embedding = await factory.createEmbedding()
    assert.isFunction(chat.generateCompletion)
    assert.isFunction(embedding.embedTexts)
  })

  test('createEmbeddingFor returns FakeLlmProvider when NODE_ENV=test', async ({ assert }) => {
    const factory = await app.container.make(LlmProviderFactory)
    assert.instanceOf(await factory.createEmbeddingFor(LlmChatProvider.Google), FakeLlmProvider)
    assert.instanceOf(await factory.createEmbeddingFor(LlmChatProvider.Mistral), FakeLlmProvider)
  })

  test('IoC binds of chat, embed, and combined are not boot-time singletons', async ({
    assert,
  }) => {
    const first = await app.container.make(LlmProvider)
    const second = await app.container.make(LlmProvider)
    assert.instanceOf(first, FakeLlmProvider)
    assert.notStrictEqual(first, second)
    assert.instanceOf(await app.container.make(ChatLlmProvider), FakeLlmProvider)
    assert.instanceOf(await app.container.make(EmbeddingLlmProvider), FakeLlmProvider)
  })

  test('driverFor returns LangChain providers per chatProvider', ({ assert }) => {
    const factory = new LlmProviderFactory({} as PlatformAiConfigService)
    assert.instanceOf(factory.driverFor('fake'), FakeLlmProvider)
    assert.instanceOf(factory.driverFor(LlmChatProvider.Openai), OpenAiLlmProvider)
    assert.instanceOf(factory.driverFor(LlmChatProvider.Google), GoogleLlmProvider)
    assert.instanceOf(factory.driverFor(LlmChatProvider.Mistral), MistralLlmProvider)
  })

  test('driverFor rejects an unsupported provider', ({ assert }) => {
    const factory = new LlmProviderFactory({} as PlatformAiConfigService)
    assert.throws(
      () => factory.driverFor('anthropic' as LlmChatProvider),
      LlmException,
      /not available/
    )
  })

  test('providerNameForRole uses embeddingProvider for embed calls', ({ assert }) => {
    assert.equal(
      providerNameForRole(
        { chatProvider: LlmChatProvider.Openai, embeddingProvider: LlmChatProvider.Mistral },
        'chat'
      ),
      LlmChatProvider.Openai
    )
    assert.equal(
      providerNameForRole(
        { chatProvider: LlmChatProvider.Openai, embeddingProvider: LlmChatProvider.Mistral },
        'embedding'
      ),
      LlmChatProvider.Mistral
    )
  })
})
