import vine from '@vinejs/vine'
import { LLM_CHAT_PROVIDERS } from '#enums/llm_chat_provider'

export const updatePlatformAiConfigValidator = vine.create(
  vine.object({
    isEnabled: vine.boolean().optional(),
    chatProvider: vine.enum(LLM_CHAT_PROVIDERS).optional(),
    chatModel: vine.string().trim().minLength(1).maxLength(100).optional(),
    summaryModel: vine.string().trim().minLength(1).maxLength(100).nullable().optional(),
    modelName: vine.string().trim().minLength(1).maxLength(100).optional(),
    temperature: vine.number().min(0).max(2).optional(),
    campaignAttributionWindowHours: vine.number().withoutDecimals().min(1).max(168).optional(),
    minConfidenceScore: vine.number().min(0).max(1).optional(),
    debounceDelaySeconds: vine.number().withoutDecimals().min(1).max(15).optional(),
    systemPrompt: vine.string().trim().nullable().optional(),
    handoverKeywords: vine
      .array(vine.string().trim().minLength(1).maxLength(80))
      .minLength(1)
      .maxLength(50)
      .optional(),
    workingSetSize: vine.number().withoutDecimals().min(2).max(20).optional(),
    summaryTurnThreshold: vine.number().withoutDecimals().min(2).max(200).optional(),
    embeddingProvider: vine.enum(LLM_CHAT_PROVIDERS).optional(),
    embeddingModel: vine.string().trim().minLength(1).maxLength(100).optional(),
    activeEmbeddingSpaceId: vine.string().trim().minLength(1).maxLength(160).optional(),
    maxOutputTokens: vine.number().withoutDecimals().min(1).max(8192).optional(),
    confirmReindex: vine.boolean().optional(),
  })
)
