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
 * Chat completions. Domain code must not import vendor SDKs.
 */
export abstract class ChatLlmProvider {
  abstract readonly name: string

  abstract generateCompletion(options: LlmCompletionOptions): Promise<LlmCompletionResult>

  abstract streamCompletion(
    options: LlmCompletionOptions
  ): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown>
}

/**
 * Text embeddings. Vectors must be KNOWLEDGE_EMBEDDING_DIMENSIONS long.
 */
export abstract class EmbeddingLlmProvider {
  abstract readonly name: string

  abstract embedTexts(texts: string[], model?: string): Promise<number[][]>
}

/**
 * Combined chat+embed binding. Prefer ChatLlmProvider / EmbeddingLlmProvider at call sites.
 */
export abstract class LlmProvider extends ChatLlmProvider implements EmbeddingLlmProvider {
  abstract embedTexts(texts: string[], model?: string): Promise<number[][]>
}
