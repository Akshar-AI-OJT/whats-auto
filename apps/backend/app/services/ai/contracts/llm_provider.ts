export interface LlmCompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt: string
  userPrompt: string
  contextChunks?: Array<{ content: string; score: number }>
}

export interface LlmCompletionResult {
  text: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  modelName: string
  latencyMs: number
}

export interface LlmTokenDelta {
  chunkIndex: number
  delta: string
  isComplete: boolean
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Swappable LLM boundary. Bind via IoC — domain code must not import OpenAI.
 */
export abstract class LlmProvider {
  abstract readonly name: string

  abstract generateCompletion(options: LlmCompletionOptions): Promise<LlmCompletionResult>

  abstract streamCompletion(
    options: LlmCompletionOptions
  ): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown>

  abstract embedTexts(texts: string[], model?: string): Promise<number[][]>
}
