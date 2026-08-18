import vine from '@vinejs/vine'

export const TAG_STATUSES = ['active', 'inactive'] as const
export type TagStatus = (typeof TAG_STATUSES)[number]
export const TAG_DEFAULT_STATUS = 'active' as const

export const createTagValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    color: vine.string().trim().maxLength(32).nullable().optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
  })
)

export const updateTagValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    color: vine.string().trim().maxLength(32).nullable().optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
    status: vine.enum(TAG_STATUSES).optional(),
  })
)

export const tagIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const tagContactParamsValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
    contactId: vine.string().trim().uuid(),
  })
)

export const assignTagContactValidator = vine.create(
  vine.object({
    contactId: vine.string().trim().uuid(),
  })
)
