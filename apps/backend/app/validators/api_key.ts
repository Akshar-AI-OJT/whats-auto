import vine from '@vinejs/vine'

export const createApiKeyValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    scopes: vine.array(vine.literal('events:write')).optional(),
  })
)

export const apiKeyIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
