import vine from '@vinejs/vine'
import { PLATFORM_AUDIT_EVENT_TYPES, TENANT_AUDIT_EVENT_TYPES } from '#abilities/audit_events'
import { PRODUCT_PERMISSIONS } from '#abilities/permissions'
import { SYSTEM_ROLE_NAMES, UNASSIGNABLE_ROLE_NAMES } from '#services/role_service'

const assignableRole = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(20)
    .notIn([...UNASSIGNABLE_ROLE_NAMES])

export const createRoleValidator = vine.create(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(20)
      .notIn([...SYSTEM_ROLE_NAMES]),
    permissions: vine.array(vine.enum(PRODUCT_PERMISSIONS)).minLength(1),
  })
)

export const updateRoleValidator = vine.create(
  vine.object({
    permissions: vine.array(vine.enum(PRODUCT_PERMISSIONS)).minLength(1),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const deleteRoleValidator = vine.create(
  vine.object({
    replacementRole: assignableRole(),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const resetRoleValidator = vine.create(
  vine.object({
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const assignMemberRoleValidator = vine.create(
  vine.object({
    role: assignableRole(),
  })
)

export const transferOwnershipValidator = vine.create(
  vine.object({
    targetMemberId: vine.string().trim().uuid(),
    replacementRoleForCurrentOwner: assignableRole(),
    reason: vine.string().trim().minLength(5).maxLength(500),
  })
)

export const previewRoleUpdateValidator = vine.create(
  vine.object({
    permissions: vine.array(vine.enum(PRODUCT_PERMISSIONS)).minLength(1),
  })
)

const auditListFilterFields = {
  search: vine.string().trim().maxLength(200).optional(),
  actorUserId: vine.string().trim().uuid().optional(),
  targetType: vine.string().trim().minLength(1).maxLength(100).optional(),
  dateFrom: vine.date().optional(),
  dateTo: vine.date().optional(),
  limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  includeFacets: vine.boolean().optional(),
}

export const listTenantAuditValidator = vine.create(
  vine.object({
    ...auditListFilterFields,
    eventType: vine.enum(TENANT_AUDIT_EVENT_TYPES).optional(),
  })
)

/** Tuyau registry still binds GET /api/v1/audit to this name. */
export const listAuditValidator = listTenantAuditValidator

export const listPlatformAuditValidator = vine.create(
  vine.object({
    ...auditListFilterFields,
    eventType: vine.enum(PLATFORM_AUDIT_EVENT_TYPES).optional(),
    organizationId: vine.string().trim().uuid().optional(),
  })
)
