import vine from '@vinejs/vine'

/** Agent inbox send content types (tenants cannot send video/document). */
export const MESSAGE_CONTENT_TYPES = ['text', 'image', 'template'] as const

export const MEDIA_CONTENT_TYPES = ['image'] as const

export const listMessagesValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const createMessageValidator = vine.create(
  vine.object({
    contentType: vine.enum(MESSAGE_CONTENT_TYPES),
    contentText: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(4096)
      .optional()
      .requiredWhen('contentType', '=', 'text'),
    mediaAssetId: vine
      .string()
      .trim()
      .uuid()
      .optional()
      .requiredWhen('contentType', 'in', [...MEDIA_CONTENT_TYPES]),
    templateId: vine.string().trim().uuid().optional().requiredWhen('contentType', '=', 'template'),
    templateParameters: vine.record(vine.string()).optional(),
    headerMediaAssetId: vine.string().trim().uuid().optional(),
  })
)
