import vine from '@vinejs/vine'

export const createOrganizationValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(200),
    slug: vine
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .minLength(2)
      .maxLength(100),
    email: vine.string().trim().email(),
    phone: vine.string().trim().optional(),
    website: vine.string().trim().url().optional(),
    industry: vine.string().trim().optional(),
    country: vine.string().trim().minLength(2).maxLength(100),
    timezone: vine.string().trim().minLength(1).maxLength(100),
    currency: vine.string().trim().maxLength(10).optional(),
  })
)

export const updateOrganizationValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(200).optional(),
    phone: vine.string().trim().optional(),
    website: vine.string().trim().url().optional(),
    industry: vine.string().trim().optional(),
    timezone: vine.string().trim().minLength(1).maxLength(100).optional(),
    currency: vine.string().trim().maxLength(10).optional(),
  })
)
