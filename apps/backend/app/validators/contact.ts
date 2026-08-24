import vine from '@vinejs/vine'

export const createContactValidator = vine.create(
  vine.object({
    phoneNumber: vine.string().trim().minLength(1).maxLength(32),
    countryCode: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    email: vine.string().trim().email().maxLength(255).optional(),
    company: vine.string().trim().minLength(1).maxLength(255).optional(),
  })
)

export const importContactsValidator = vine.create(
  vine.object({
    defaultCountryCode: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    columnMapping: vine
      .object({
        phone: vine.string().trim().minLength(1).maxLength(100).optional(),
        name: vine.string().trim().minLength(1).maxLength(100).optional(),
        email: vine.string().trim().minLength(1).maxLength(100).optional(),
        company: vine.string().trim().minLength(1).maxLength(100).optional(),
      })
      .optional(),
  })
)

export const contactIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
