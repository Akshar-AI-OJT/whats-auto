import vine from '@vinejs/vine'

export const createTagValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    color: vine.string().trim().maxLength(32).nullable().optional(),
  })
)

export const updateTagValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    color: vine.string().trim().maxLength(32).nullable().optional(),
  })
)

export const tagIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const tagContactParamsValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
    contactId: vine.string().trim().uuid(),
  })
)

export const assignTagContactValidator = vine.create(
  vine.object({
    contactId: vine.string().trim().uuid(),
  })
)
