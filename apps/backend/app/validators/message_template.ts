import vine from '@vinejs/vine'

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
export const TEMPLATE_HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const

export const listMessageTemplatesValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    status: vine.string().trim().optional(),
    category: vine.string().trim().optional(),
    search: vine.string().trim().optional(),
  })
)

export const templateIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createMessageTemplateValidator = vine.create(
  vine.object({
    name: vine
      .string()
      .trim()
      .regex(/^[a-z0-9_]+$/)
      .minLength(1)
      .maxLength(512),
    category: vine
      .string()
      .trim()
      .transform((val) => val.toUpperCase()),
    language: vine.string().trim().minLength(2).maxLength(10),
    headerType: vine
      .string()
      .trim()
      .transform((val) => val.toUpperCase())
      .optional(),
    headerContent: vine.string().trim().optional(),
    bodyText: vine.string().trim().minLength(1).maxLength(1024),
    footerText: vine.string().trim().maxLength(60).optional(),
    buttons: vine.array(vine.any()).optional(),
    sampleValues: vine.any().optional(),
  })
)
