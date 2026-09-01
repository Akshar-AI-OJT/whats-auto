import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
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

const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite'
const DEFAULT_EMBED_MODEL = 'gemini-embedding-2'

export type GoogleLlmProviderOptions = {
  apiKey?: string
  chat?: LangChainChatModel
  embeddings?: LangChainEmbeddings
}

/**
 * LangChain Google Gemini chat + embeddings. Domain code must depend on LlmProvider only.
 */
export default class GoogleLlmProvider extends LlmProvider {
  readonly name = 'google'
  #apiKey: string | undefined
  #chat: LangChainChatModel | undefined
  #embeddings: LangChainEmbeddings | undefined

  constructor(options: GoogleLlmProviderOptions = {}) {
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
    return new ChatGoogleGenerativeAI({
      apiKey: this.#requireKey(),
      model: options.model ?? DEFAULT_CHAT_MODEL,
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    })
  }

  #embeddingModel(model: string): LangChainEmbeddings {
    if (this.#embeddings) return this.#embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: this.#requireKey(),
      model,
    })
    requestOutputDimensionality(embeddings, KNOWLEDGE_EMBEDDING_DIMENSIONS)
    return embeddings
  }

  #requireKey(): string {
    if (!this.#apiKey) throw LlmException.missingApiKey('GOOGLE_AI_API_KEY')
    return this.#apiKey
  }
}

type EmbedContentBuilder = {
  _convertToContent: (text: string) => Record<string, unknown>
}

/** LangChain's wrapper does not expose Gemini `outputDimensionality`; request 1024 at call time. */
export function requestOutputDimensionality(
  embeddings: GoogleGenerativeAIEmbeddings,
  dimensions: number
) {
  const target = embeddings as unknown as EmbedContentBuilder
  const original = target._convertToContent.bind(embeddings)
  target._convertToContent = (text: string) => ({
    ...original(text),
    outputDimensionality: dimensions,
  })
}
