import vine from '@vinejs/vine'

export const updatePlatformAiConfigValidator = vine.create(
  vine.object({
    isEnabled: vine.boolean().optional(),
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
    embeddingModel: vine.string().trim().minLength(1).maxLength(100).optional(),
  })
)
