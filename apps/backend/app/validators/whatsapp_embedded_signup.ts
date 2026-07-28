import vine from '@vinejs/vine'

export const completeEmbeddedSignupValidator = vine.create(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(2048),
    wabaId: vine.string().trim().minLength(1).maxLength(64),
    phoneNumberId: vine.string().trim().minLength(1).maxLength(64),
    businessId: vine.string().trim().minLength(1).maxLength(64).optional(),
  })
)

export const testWhatsappConfigValidator = vine.create(
  vine.object({
    to: vine.string().trim().minLength(5).maxLength(32),
    templateName: vine.string().trim().minLength(1).maxLength(512).optional(),
    languageCode: vine.string().trim().minLength(2).maxLength(16).optional(),
  })
)
