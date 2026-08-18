import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import LlmException from '#exceptions/llm_exception'
import {
  LlmProvider,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  type LlmTokenDelta,
} from '#services/ai/contracts/llm_provider'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'
import {
  assertEmbeddingVectors,
  generateFromLangChain,
  streamFromLangChain,
  type LangChainChatModel,
  type LangChainEmbeddings,
} from '#services/ai/drivers/langchain_completion'

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini'
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small'

export type OpenAiLlmProviderOptions = {
  apiKey?: string
  chat?: LangChainChatModel
  embeddings?: LangChainEmbeddings
}

/**
 * LangChain OpenAI chat + embeddings. Domain code must depend on LlmProvider only.
 */
export default class OpenAiLlmProvider extends LlmProvider {
  readonly name = 'openai'
  #apiKey: string | undefined
  #chat: LangChainChatModel | undefined
  #embeddings: LangChainEmbeddings | undefined

  constructor(options: OpenAiLlmProviderOptions = {}) {
    super()
    this.#apiKey = options.apiKey
    this.#chat = options.chat
    this.#embeddings = options.embeddings
  }

  async generateCompletion(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const model = options.model ?? DEFAULT_CHAT_MODEL
    try {
      return await generateFromLangChain(this.#chatModel(options), options, model)
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }
  }

  async *streamCompletion(
    options: LlmCompletionOptions
  ): AsyncGenerator<LlmTokenDelta, LlmCompletionResult, unknown> {
    const model = options.model ?? DEFAULT_CHAT_MODEL
    try {
      return yield* streamFromLangChain(this.#chatModel(options), options, model)
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }
  }

  async embedTexts(texts: string[], model = DEFAULT_EMBED_MODEL): Promise<number[][]> {
    if (texts.length === 0) return []
    try {
      const vectors = await this.#embeddingModel(model).embedDocuments(texts)
      if (vectors.length !== texts.length) throw LlmException.emptyEmbedding()
      return assertEmbeddingVectors(vectors)
    } catch (error) {
      if (error instanceof LlmException) throw error
      throw LlmException.providerFailed(error)
    }
  }

  #chatModel(options: LlmCompletionOptions): LangChainChatModel {
    if (this.#chat) return this.#chat
    return new ChatOpenAI({
      apiKey: this.#requireKey(),
      model: options.model ?? DEFAULT_CHAT_MODEL,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })
  }

  #embeddingModel(model: string): LangChainEmbeddings {
    if (this.#embeddings) return this.#embeddings
    return new OpenAIEmbeddings({
      apiKey: this.#requireKey(),
      model,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    })
  }

  #requireKey(): string {
    if (!this.#apiKey) throw LlmException.missingApiKey('OPENAI_API_KEY')
    return this.#apiKey
  }
}
