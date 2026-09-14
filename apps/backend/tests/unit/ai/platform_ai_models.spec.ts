import { test } from '@japa/runner'
import { LLM_CHAT_PROVIDERS, LlmChatProvider } from '#enums/llm_chat_provider'
import {
  catalogForProvider,
  isAllowedChatModel,
  isAllowedEmbeddingModel,
} from '#services/ai/platform_ai_models'

test.group('platform AI model catalog', () => {
  test('every provider default is in that provider allowlist', ({ assert }) => {
    for (const provider of LLM_CHAT_PROVIDERS) {
      const catalog = catalogForProvider(provider)
      assert.isAbove(catalog.chat.length, 0)
      assert.isAbove(catalog.embedding.length, 0)
      assert.isTrue(isAllowedChatModel(provider, catalog.defaults.chatModel))
      assert.isTrue(isAllowedEmbeddingModel(provider, catalog.defaults.embeddingModel))
      if (catalog.defaults.summaryModel) {
        assert.isTrue(isAllowedChatModel(provider, catalog.defaults.summaryModel))
      }
    }
  })

  test('rejects a chat model that belongs to another provider', ({ assert }) => {
    const openaiChat = catalogForProvider(LlmChatProvider.Openai).defaults.chatModel
    const googleChat = catalogForProvider(LlmChatProvider.Google).defaults.chatModel
    assert.isFalse(isAllowedChatModel(LlmChatProvider.Openai, googleChat))
    assert.isFalse(isAllowedChatModel(LlmChatProvider.Google, openaiChat))
  })

  test('rejects retired embedding models that cannot be 1024-d', ({ assert }) => {
    assert.isFalse(isAllowedEmbeddingModel(LlmChatProvider.Openai, 'text-embedding-ada-002'))
    assert.isFalse(isAllowedEmbeddingModel(LlmChatProvider.Google, 'text-embedding-004'))
  })
})
