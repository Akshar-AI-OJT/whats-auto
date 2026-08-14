import { ChatMistralAI, MistralAIEmbeddings } from '@langchain/mistralai'
import LlmException from '#exceptions/llm_exception'
import {
  LlmProvider,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  type LlmTokenDelta,
} from '#services/ai/contracts/llm_provider'
import {
  assertEmbeddingVectors,
  generateFromLangChain,
  streamFromLangChain,
  type LangChainChatModel,
  type LangChainEmbeddings,
} from '#services/ai/drivers/langchain_completion'

const DEFAULT_CHAT_MODEL = 'mistral-small-latest'
const DEFAULT_EMBED_MODEL = 'mistral-embed'

export type MistralLlmProviderOptions = {
  apiKey?: string
  chat?: LangChainChatModel
  embeddings?: LangChainEmbeddings
}

/**
 * LangChain Mistral chat + native 1024-d embeddings. Domain code must depend on LlmProvider only.
 */
export default class MistralLlmProvider extends LlmProvider {
  readonly name = 'mistral'
  #apiKey: string | undefined
  #chat: LangChainChatModel | undefined
  #embeddings: LangChainEmbeddings | undefined

  constructor(options: MistralLlmProviderOptions = {}) {
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
    return new ChatMistralAI({
      apiKey: this.#requireKey(),
      model: options.model ?? DEFAULT_CHAT_MODEL,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })
  }

  #embeddingModel(model: string): LangChainEmbeddings {
    if (this.#embeddings) return this.#embeddings
    return new MistralAIEmbeddings({
      apiKey: this.#requireKey(),
      model,
    })
  }

  #requireKey(): string {
    if (!this.#apiKey) throw LlmException.missingApiKey('MISTRAL_API_KEY')
    return this.#apiKey
  }
}
