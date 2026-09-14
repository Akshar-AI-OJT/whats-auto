/** Keep in sync with apps/backend/app/services/ai/platform_ai_models.ts */

export const PLATFORM_AI_PROVIDERS = ['openai', 'google', 'mistral'] as const

export type PlatformAiProvider = (typeof PLATFORM_AI_PROVIDERS)[number]

export const PLATFORM_AI_MODELS: Record<
  PlatformAiProvider,
  {
    chat: readonly string[]
    embedding: readonly string[]
    defaults: {
      chatModel: string
      summaryModel: string | null
      embeddingModel: string
    }
  }
> = {
  openai: {
    chat: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
    defaults: {
      chatModel: 'gpt-4o-mini',
      summaryModel: null,
      embeddingModel: 'text-embedding-3-small',
    },
  },
  google: {
    chat: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'],
    embedding: ['gemini-embedding-2'],
    defaults: {
      chatModel: 'gemini-3.5-flash-lite',
      summaryModel: 'gemini-3.1-flash-lite',
      embeddingModel: 'gemini-embedding-2',
    },
  },
  mistral: {
    chat: ['mistral-small-2603', 'ministral-3b-2512'],
    embedding: ['mistral-embed'],
    defaults: {
      chatModel: 'mistral-small-2603',
      summaryModel: 'ministral-3b-2512',
      embeddingModel: 'mistral-embed',
    },
  },
}

export const PLATFORM_AI_LIMITS = {
  temperature: { min: 0, max: 2 },
  campaignAttributionWindowHours: { min: 1, max: 168 },
  minConfidenceScore: { min: 0, max: 1 },
  debounceDelaySeconds: { min: 1, max: 15 },
  workingSetSize: { min: 2, max: 20 },
  summaryTurnThreshold: { min: 2, max: 200 },
  maxOutputTokens: { min: 1, max: 8192 },
} as const

export function catalogForProvider(provider: string) {
  if ((PLATFORM_AI_PROVIDERS as readonly string[]).includes(provider)) {
    return PLATFORM_AI_MODELS[provider as PlatformAiProvider]
  }
  return PLATFORM_AI_MODELS.openai
}

export function selectOptionsWithCurrent(allowed: readonly string[], current: string): string[] {
  if (!current || allowed.includes(current)) return [...allowed]
  return [...allowed, current]
}
