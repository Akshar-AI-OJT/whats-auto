import vine from '@vinejs/vine'

export const initiateMediaUploadValidator = vine.create(
  vine.object({
    fileName: vine.string().trim().minLength(1).maxLength(255),
    mimeType: vine.string().trim().minLength(3).maxLength(255),
    fileSize: vine.number().withoutDecimals().min(1),
  })
)

export const mediaUploadIdParamValidator = vine.create(
  vine.object({
    id: vine.string().uuid(),
  })
)

export const mediaAssetIdParamValidator = vine.create(
  vine.object({
    id: vine.string().uuid(),
  })
)

export const listMediaLibraryValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    state: vine.enum(['ready', 'deleted'] as const).optional(),
    kind: vine.enum(['image', 'document'] as const).optional(),
    search: vine.string().trim().maxLength(255).optional(),
  })
)
