import vine from '@vinejs/vine'

export const createContactValidator = vine.create(
  vine.object({
    phone: vine.string().trim().minLength(7).maxLength(32),
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    email: vine.string().trim().email().maxLength(255).optional(),
    company: vine.string().trim().minLength(1).maxLength(255).optional(),
  })
)

export const contactIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
