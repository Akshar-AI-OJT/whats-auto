import vine from '@vinejs/vine'
import { UNASSIGNABLE_ROLE_NAMES } from '#services/role_service'

const email = () => vine.string().trim().email().normalizeEmail().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(128)
const assignableRole = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(20)
    .notIn([...UNASSIGNABLE_ROLE_NAMES])

export const listOrganizationAdminUsersValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const organizationAdminUserIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createOrganizationAdminUserValidator = vine.create(
  vine.object({
    firstname: vine.string().trim().minLength(1).maxLength(100),
    lastname: vine.string().trim().minLength(1).maxLength(100),
    email: email(),
    password: password(),
    role: assignableRole(),
  })
)

export const updateOrganizationAdminUserValidator = vine.create(
  vine.object({
    firstname: vine.string().trim().minLength(1).maxLength(100).optional(),
    lastname: vine.string().trim().minLength(1).maxLength(100).optional(),
    email: email().optional(),
    isActive: vine.boolean().optional(),
  })
)
