import { LlmChatProvider } from '#enums/llm_chat_provider'

export type PlatformAiModelCatalog = {
  chat: readonly string[]
  embedding: readonly string[]
  defaults: {
    chatModel: string
    summaryModel: string | null
    embeddingModel: string
  }
}

export const PLATFORM_AI_MODELS: Record<LlmChatProvider, PlatformAiModelCatalog> = {
  [LlmChatProvider.Openai]: {
    chat: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
    defaults: {
      chatModel: 'gpt-4o-mini',
      summaryModel: null,
      embeddingModel: 'text-embedding-3-small',
    },
  },
  [LlmChatProvider.Google]: {
    chat: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'],
    embedding: ['gemini-embedding-2'],
    defaults: {
      chatModel: 'gemini-3.5-flash-lite',
      summaryModel: 'gemini-3.1-flash-lite',
      embeddingModel: 'gemini-embedding-2',
    },
  },
  [LlmChatProvider.Mistral]: {
    chat: ['mistral-small-2603', 'ministral-3b-2512'],
    embedding: ['mistral-embed'],
    defaults: {
      chatModel: 'mistral-small-2603',
      summaryModel: 'ministral-3b-2512',
      embeddingModel: 'mistral-embed',
    },
  },
}

export function catalogForProvider(provider: LlmChatProvider): PlatformAiModelCatalog {
  return PLATFORM_AI_MODELS[provider]
}

export function isAllowedChatModel(provider: LlmChatProvider, model: string): boolean {
  return catalogForProvider(provider).chat.includes(model)
}

export function isAllowedEmbeddingModel(provider: LlmChatProvider, model: string): boolean {
  return catalogForProvider(provider).embedding.includes(model)
}
