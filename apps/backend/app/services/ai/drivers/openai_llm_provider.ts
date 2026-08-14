import OpenAI from 'openai'
import {
  LlmProvider,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  type LlmTokenDelta,
} from '#services/ai/contracts/llm_provider'
import { buildLlmMessages } from '#services/ai/build_llm_messages'
import LlmException from '#exceptions/llm_exception'

const DEFAULT_MODEL = 'gpt-4o-mini'

export type OpenAiLlmProviderOptions = {
  apiKey?: string
  client?: OpenAI
}

/**
 * Thin official OpenAI SDK wrapper. Domain code must depend on LlmProvider only.
 */
export default class OpenAiLlmProvider extends LlmProvider {
  readonly name = 'openai'
  #apiKey: string | undefined
  #client: OpenAI | undefined

  constructor(options: OpenAiLlmProviderOptions = {}) {
    super()
    this.#apiKey = options.apiKey
    this.#client = options.client
  }

  async generateCompletion(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const started = Date.now()
    const model = options.model ?? DEFAULT_MODEL

    try {
      const completion = await this.#openai().chat.completions.create({
        model,
        messages: buildLlmMessages(options),
        ...openAiSampling(options),
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) {
        throw LlmException.emptyCompletion()
      }

      return {
        text,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
        modelName: completion.model ?? model,
        latencyMs: Date.now() - started,
      }
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }
  }

  async *streamCompletion(
    options: LlmCompletionOptions
  ): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown> {
    const started = Date.now()
    const model = options.model ?? DEFAULT_MODEL
    let text = ''
    let chunkIndex = 0
    let promptTokens = 0
    let completionTokens = 0
    let totalTokens = 0
    let modelName = model

    try {
      const stream = await this.#openai().chat.completions.create({
        model,
        messages: buildLlmMessages(options),
        ...openAiSampling(options),
        stream: true,
        stream_options: { include_usage: true },
      })

      for await (const chunk of stream) {
        if (chunk.model) modelName = chunk.model
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens
          completionTokens = chunk.usage.completion_tokens ?? completionTokens
          totalTokens = chunk.usage.total_tokens ?? totalTokens
        }

        const delta = chunk.choices[0]?.delta?.content
        if (!delta) continue

        text += delta
        yield {
          chunkIndex,
          delta,
          isComplete: false,
        }
        chunkIndex += 1
      }
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }

    const trimmed = text.trim()
    if (!trimmed) {
      throw LlmException.emptyCompletion()
    }

    const usage = {
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || promptTokens + completionTokens,
    }

    yield {
      chunkIndex,
      delta: '',
      isComplete: true,
      usage,
    }

    return {
      text: trimmed,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      modelName,
      latencyMs: Date.now() - started,
    }
  }

  async embedTexts(texts: string[], model = 'text-embedding-3-small'): Promise<number[][]> {
    if (texts.length === 0) return []

    try {
      const response = await this.#openai().embeddings.create({
        model,
        input: texts,
      })
      const byIndex = [...response.data].sort((a, b) => a.index - b.index)
      if (byIndex.length !== texts.length) {
        throw LlmException.emptyEmbedding()
      }
      return byIndex.map((row) => {
        if (!row.embedding || row.embedding.length === 0) {
          throw LlmException.emptyEmbedding()
        }
        return row.embedding
      })
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }
  }

  #openai(): OpenAI {
    if (this.#client) return this.#client
    if (!this.#apiKey) {
      throw LlmException.missingApiKey()
    }
    this.#client = new OpenAI({ apiKey: this.#apiKey })
    return this.#client
  }
}

function openAiSampling(options: LlmCompletionOptions) {
  return {
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxTokens !== undefined ? { max_completion_tokens: options.maxTokens } : {}),
  }
}
