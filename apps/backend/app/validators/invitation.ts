import vine from '@vinejs/vine'

export const createInvitationValidator = vine.create(
  vine.object({
    email: vine.string().trim().email().normalizeEmail(),
    firstname: vine.string().trim().minLength(1).maxLength(50),
    lastname: vine.string().trim().maxLength(50).optional(),
    role: vine.string().trim().minLength(1).maxLength(20),
    designation: vine.string().trim().maxLength(120).optional(),
  })
)
