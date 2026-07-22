import vine from '@vinejs/vine'
import { ALL_PERMISSIONS } from '#abilities/permissions'
import { RESERVED_ROLE_KEYS } from '#services/role_service'

const nonReservedRole = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .notIn([...RESERVED_ROLE_KEYS])

export const createRoleValidator = vine.create(
  vine.object({
    displayName: vine.string().trim().minLength(2).maxLength(50),
    permissions: vine.array(vine.enum(ALL_PERMISSIONS)).minLength(1),
  })
)

export const updateRoleValidator = vine.create(
  vine.object({
    permissions: vine.array(vine.enum(ALL_PERMISSIONS)).minLength(1),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const deleteRoleValidator = vine.create(
  vine.object({
    replacementRole: nonReservedRole(),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const assignMemberRoleValidator = vine.create(
  vine.object({
    role: nonReservedRole(),
  })
)

export const transferOwnershipValidator = vine.create(
  vine.object({
    targetMemberId: vine.string().trim().uuid(),
    replacementRoleForCurrentOwner: nonReservedRole(),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const previewRoleUpdateValidator = vine.create(
  vine.object({
    permissions: vine.array(vine.enum(ALL_PERMISSIONS)).minLength(1),
  })
)

export const listAuditValidator = vine.create(
  vine.object({
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)
