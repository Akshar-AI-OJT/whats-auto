import vine from '@vinejs/vine'

export const billingVerifyValidator = vine.create(
  vine.object({
    razorpayOrderId: vine.string().trim().minLength(1),
    razorpayPaymentId: vine.string().trim().minLength(1),
    razorpaySignature: vine.string().trim().minLength(1),
  })
)
