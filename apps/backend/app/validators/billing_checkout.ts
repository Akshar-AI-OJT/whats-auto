import vine from '@vinejs/vine'

export const billingCheckoutValidator = vine.create(
  vine.object({
    planId: vine.string().trim().uuid(),
  })
)
