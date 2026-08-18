import vine from '@vinejs/vine'

export const listNotificationsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const notificationIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
