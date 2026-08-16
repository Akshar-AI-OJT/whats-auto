import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import LlmException from '#exceptions/llm_exception'
import { buildLlmMessages } from '#services/ai/build_llm_messages'
import type {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmTokenDelta,
} from '#services/ai/contracts/llm_provider'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'

export type LangChainUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export type LangChainChatMessage = {
  content: unknown
  usage_metadata?: LangChainUsage
  response_metadata?: Record<string, unknown>
}

export type LangChainChatModel = {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<LangChainChatMessage>
  stream(
    messages: Array<SystemMessage | HumanMessage>
  ): AsyncIterable<LangChainChatMessage> | Promise<AsyncIterable<LangChainChatMessage>>
}

export type LangChainEmbeddings = {
  embedDocuments(texts: string[]): Promise<number[][]>
}

export function toLangChainMessages(
  options: LlmCompletionOptions
): Array<SystemMessage | HumanMessage> {
  return buildLlmMessages(options).map((row) =>
    row.role === 'system' ? new SystemMessage(row.content) : new HumanMessage(row.content)
  )
}

export function textFromLangChainContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text
      }
      return ''
    })
    .join('')
}

export async function generateFromLangChain(
  model: LangChainChatModel,
  options: LlmCompletionOptions,
  fallbackModel: string
): Promise<LlmCompletionResult> {
  const started = Date.now()
  const message = await model.invoke(toLangChainMessages(options))
  const text = textFromLangChainContent(message.content).trim()
  if (!text) throw LlmException.emptyCompletion()
  return toCompletionResult(message, text, fallbackModel, started)
}

export async function* streamFromLangChain(
  model: LangChainChatModel,
  options: LlmCompletionOptions,
  fallbackModel: string
): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown> {
  const started = Date.now()
  let text = ''
  let chunkIndex = 0
  let last: LangChainChatMessage | undefined

  const stream = await model.stream(toLangChainMessages(options))
  for await (const chunk of stream) {
    last = chunk
    const delta = textFromLangChainContent(chunk.content)
    if (!delta) continue
    text += delta
    yield { chunkIndex, delta, isComplete: false }
    chunkIndex += 1
  }

  const trimmed = text.trim()
  if (!trimmed) throw LlmException.emptyCompletion()

  const result = toCompletionResult(last ?? { content: trimmed }, trimmed, fallbackModel, started)
  yield {
    chunkIndex,
    delta: '',
    isComplete: true,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
    },
  }
  return result
}

export function assertEmbeddingVectors(vectors: number[][]): number[][] {
  for (const row of vectors) {
    if (!row || row.length === 0) throw LlmException.emptyEmbedding()
    if (row.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      throw LlmException.embeddingDimensionMismatch(row.length, KNOWLEDGE_EMBEDDING_DIMENSIONS)
    }
    if (row.some((value) => !Number.isFinite(value))) {
      throw LlmException.embeddingDimensionMismatch(row.length, KNOWLEDGE_EMBEDDING_DIMENSIONS)
    }
  }
  return vectors
}

function toCompletionResult(
  message: LangChainChatMessage,
  text: string,
  fallbackModel: string,
  started: number
): LlmCompletionResult {
  const promptTokens = message.usage_metadata?.input_tokens ?? 0
  const completionTokens = message.usage_metadata?.output_tokens ?? 0
  const totalTokens = message.usage_metadata?.total_tokens ?? promptTokens + completionTokens
  const modelName =
    stringMeta(message.response_metadata, 'model_name') ??
    stringMeta(message.response_metadata, 'model') ??
    fallbackModel

  return {
    text,
    promptTokens,
    completionTokens,
    totalTokens,
    modelName,
    latencyMs: Date.now() - started,
  }
}

function stringMeta(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
