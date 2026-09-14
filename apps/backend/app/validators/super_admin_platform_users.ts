import vine from '@vinejs/vine'

export const PLATFORM_USER_STATUSES = ['active', 'inactive', 'all'] as const

export const listSuperAdminPlatformUsersValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    search: vine.string().trim().maxLength(200).optional(),
    status: vine.enum(PLATFORM_USER_STATUSES).optional(),
    organizationId: vine.string().trim().uuid().optional(),
    role: vine.string().trim().minLength(1).maxLength(100).optional(),
  })
)
