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
