import vine from '@vinejs/vine'

const email = () => vine.string().trim().email().normalizeEmail().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(128)

export const preSignupValidator = vine.create(
  vine.object({
    firstname: vine.string().trim().minLength(1).maxLength(100),
    lastname: vine.string().trim().minLength(1).maxLength(100),
    email: email(),
    password: password(),
  })
)

export const resendSignupOtpValidator = vine.create(
  vine.object({
    email: email(),
  })
)

export const verifySignupValidator = vine.create(
  vine.object({
    email: email(),
    otp: vine
      .string()
      .trim()
      .fixedLength(6)
      .regex(/^\d{6}$/),
    password: password(),
  })
)
