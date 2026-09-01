import { test } from '@japa/runner'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import { assertPlatformLlmReady } from '#services/ai/platform_ai_config_service'

test.group('assertPlatformLlmReady', () => {
  test('allows a missing key when AI is disabled', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertPlatformLlmReady({
        isEnabled: false,
        nodeEnv: 'production',
        chatProvider: LlmChatProvider.Openai,
        apiKey: undefined,
      })
    )
  })

  test('allows a missing key in test even when enabled', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertPlatformLlmReady({
        isEnabled: true,
        nodeEnv: 'test',
        chatProvider: LlmChatProvider.Mistral,
        apiKey: undefined,
      })
    )
  })

  test('fails when enabled outside test without a key for the selected provider', ({ assert }) => {
    assert.throws(
      () =>
        assertPlatformLlmReady({
          isEnabled: true,
          nodeEnv: 'production',
          chatProvider: LlmChatProvider.Mistral,
          apiKey: undefined,
        }),
      /MISTRAL_API_KEY is required/
    )
  })
})
