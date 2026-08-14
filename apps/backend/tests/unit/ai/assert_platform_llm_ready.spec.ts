import { test } from '@japa/runner'
import { assertPlatformLlmReady } from '#services/ai/platform_ai_config_service'

test.group('assertPlatformLlmReady', () => {
  test('allows a missing key when AI is disabled', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertPlatformLlmReady({ isEnabled: false, nodeEnv: 'production', apiKey: undefined })
    )
  })

  test('allows a missing key in test even when enabled', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertPlatformLlmReady({ isEnabled: true, nodeEnv: 'test', apiKey: undefined })
    )
  })

  test('fails when enabled outside test without a key', ({ assert }) => {
    assert.throws(
      () => assertPlatformLlmReady({ isEnabled: true, nodeEnv: 'production', apiKey: undefined }),
      /OPENAI_API_KEY is required/
    )
  })
})
