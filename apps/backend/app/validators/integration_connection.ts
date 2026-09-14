import vine from '@vinejs/vine'

export const integrationProviderParamValidator = vine.create(
  vine.object({
    provider: vine.string().trim().minLength(1).maxLength(64),
  })
)

export const upsertIntegrationConnectionValidator = vine.create(
  vine.object({
    displayName: vine.string().trim().minLength(1).maxLength(255),
    externalAccountId: vine.string().trim().minLength(1).maxLength(255).nullable().optional(),
    config: vine.record(vine.any()).optional(),
  })
)
