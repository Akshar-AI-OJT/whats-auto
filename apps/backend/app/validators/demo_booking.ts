import vine from '@vinejs/vine'

const email = () => vine.string().trim().email().normalizeEmail().maxLength(254)

export const demoAvailabilityQueryValidator = vine.create(
  vine.object({
    date: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: vine.string().trim().minLength(1).maxLength(100).optional(),
  })
)

export const createDemoBookingValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    email: email(),
    slotId: vine.string().trim().minLength(10).maxLength(64),
    timeZone: vine.string().trim().minLength(1).maxLength(100),
    company: vine.string().trim().maxLength(255).optional(),
    phone: vine.string().trim().maxLength(40).optional(),
    companySize: vine.string().trim().maxLength(40).optional(),
    purpose: vine.string().trim().maxLength(40).optional(),
  })
)
