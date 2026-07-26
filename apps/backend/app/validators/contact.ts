import vine from '@vinejs/vine'

export const createContactValidator = vine.create(
  vine.object({
    phone: vine.string().trim().minLength(3).maxLength(32),
  })
)
