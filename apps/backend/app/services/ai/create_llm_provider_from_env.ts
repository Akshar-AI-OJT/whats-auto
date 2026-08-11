import type { LlmProvider } from '#services/ai/contracts/llm_provider'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import OpenAiLlmProvider from '#services/ai/drivers/openai_llm_provider'
import env from '#start/env'

export type LlmDriverName = 'openai' | 'fake'

export function resolveLlmDriverName(): LlmDriverName {
  return env.get('LLM_DRIVER') ?? (env.get('NODE_ENV') === 'test' ? 'fake' : 'openai')
}

/**
 * Resolves the LLM driver from env. Prefer IoC `LlmProvider` in app code.
 */
export function createLlmProviderFromEnv(): LlmProvider {
  if (resolveLlmDriverName() === 'fake') {
    return new FakeLlmProvider()
  }

  return new OpenAiLlmProvider({ apiKey: env.get('OPENAI_API_KEY') })
}
