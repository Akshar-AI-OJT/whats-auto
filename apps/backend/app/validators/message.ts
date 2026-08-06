import vine from '@vinejs/vine'

export const MESSAGE_CONTENT_TYPES = ['text', 'image', 'video', 'document', 'template'] as const

export const MEDIA_CONTENT_TYPES = ['image', 'video', 'document'] as const

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
  })
)
