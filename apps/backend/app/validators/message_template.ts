import vine from '@vinejs/vine'

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
export const TEMPLATE_HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT'] as const

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
    // The issue: Passing 'as const' arrays directly to .in() causes a type error because vine expects a mutable array (string[]), but 'as const' makes the array readonly.
    // Solution: Spread the readonly array to create a mutable copy when passing to .in().
    category: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_CATEGORIES]),
    language: vine.string().trim().minLength(2).maxLength(10),
    headerType: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_HEADER_TYPES])
      .optional(),
    headerContent: vine.string().trim().maxLength(60).optional(),
    bodyText: vine.string().trim().minLength(1).maxLength(1024),
    footerText: vine.string().trim().maxLength(60).optional(),
    buttons: vine.array(vine.any()).optional(),
    sampleValues: vine.any().optional(),
  })
)
