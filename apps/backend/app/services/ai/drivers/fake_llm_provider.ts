import {
  LlmProvider,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  type LlmTokenDelta,
} from '#services/ai/contracts/llm_provider'

const DEFAULT_TEXT = 'This is a fake LLM reply.'

/**
 * Deterministic LLM for tests. No network.
 */
export const FAKE_EMBEDDING_DIMENSIONS = 1536

export default class FakeLlmProvider extends LlmProvider {
  readonly name = 'fake'
  text = DEFAULT_TEXT
  readonly calls: LlmCompletionOptions[] = []
  readonly embedCalls: string[] = []

  async generateCompletion(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    this.calls.push(options)
    return this.#result(options, this.text)
  }

  async *streamCompletion(
    options: LlmCompletionOptions
  ): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown> {
    this.calls.push(options)
    const parts = splitForStream(this.text)
    const usage = usageFrom(options, this.text)

    for (const [index, delta] of parts.entries()) {
      const isComplete = index === parts.length - 1
      yield {
        chunkIndex: index,
        delta,
        isComplete,
        usage: isComplete ? usage : undefined,
      }
    }

    return this.#result(options, this.text)
  }

  async embedTexts(texts: string[], _model?: string): Promise<number[][]> {
    this.embedCalls.push(...texts)
    return texts.map(fakeEmbeddingFor)
  }

  #result(options: LlmCompletionOptions, text: string): LlmCompletionResult {
    const usage = usageFrom(options, text)
    return {
      text,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      modelName: options.model ?? 'fake',
      latencyMs: 1,
    }
  }
}

function splitForStream(text: string): string[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0)
  return parts.length > 0 ? parts : ['']
}

/** Deterministic 1536-d vector from text so unchanged chunks stay comparable. */
export function fakeEmbeddingFor(text: string): number[] {
  const vector = new Array<number>(FAKE_EMBEDDING_DIMENSIONS)
  let seed = 2166136261
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  for (let i = 0; i < FAKE_EMBEDDING_DIMENSIONS; i++) {
    seed = Math.imul(seed ^ i, 16777619)
    vector[i] = ((seed >>> 0) % 2000) / 1000 - 1
  }
  return vector
}

function usageFrom(options: LlmCompletionOptions, text: string) {
  const promptTokens = Math.max(1, options.systemPrompt.length + options.userPrompt.length)
  const completionTokens = Math.max(1, text.length)
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  }
}
