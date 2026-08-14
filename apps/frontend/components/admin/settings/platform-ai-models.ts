/** Chat models the superadmin selector may set. Backend still accepts any string. */
export const PLATFORM_AI_CHAT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const

/**
 * Embedding models that match D3 `vector(1536)`.
 * Do not add `text-embedding-3-large` (3072).
 */
export const PLATFORM_AI_EMBEDDING_MODELS = [
  'text-embedding-3-small',
  'text-embedding-ada-002',
] as const

export type PlatformAiChatModel = (typeof PLATFORM_AI_CHAT_MODELS)[number]
export type PlatformAiEmbeddingModel = (typeof PLATFORM_AI_EMBEDDING_MODELS)[number]

export const PLATFORM_AI_LIMITS = {
  temperature: { min: 0, max: 2 },
  campaignAttributionWindowHours: { min: 1, max: 168 },
  minConfidenceScore: { min: 0, max: 1 },
  debounceDelaySeconds: { min: 1, max: 15 },
  workingSetSize: { min: 2, max: 20 },
  summaryTurnThreshold: { min: 2, max: 200 },
  keywordMaxLength: 80,
  keywordMaxCount: 100,
} as const

export function selectOptionsWithCurrent(allowed: readonly string[], current: string): string[] {
  if (!current || allowed.includes(current)) return [...allowed]
  return [...allowed, current]
}
