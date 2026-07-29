import type { HttpContext } from '@adonisjs/core/http'
import { RoleService } from '#services/role_service'
import { mapRbacError } from '#lib/map_rbac_error'
import {
  createRoleValidator,
  deleteRoleValidator,
  previewRoleUpdateValidator,
  resetRoleValidator,
  updateRoleValidator,
} from '#validators/organization'
import '#types/http'

export default class RolesController {
  /**
   * @index
   * @summary List roles for the active organization
   * @description Returns global admin/agent/viewer (with effective org overrides) plus custom org roles.
   * @tag Roles
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "role": "agent", "isSystem": true, "hasOverrides": false, "permissions": ["inbox:view"] }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "No active organization. Call POST /api/v1/organizations/:id/set-active first.", "code": "NO_ACTIVE_ORG" }
   */
  async index({ request, serialize }: HttpContext) {
    const roles = await new RoleService().listRoles(request.activeMember!.organizationId)
    return serialize(roles)
  }

  /**
   * @create
   * @summary Create a custom org-scoped role
   * @description Slugifies name into an immutable role key (max 20 chars). Cannot escalate beyond the caller's permissions. Cannot use system role names.
   * @tag Roles
   * @security BearerAuth
   * @requestBody { "name": "Support Lead", "permissions": ["inbox:view", "inbox:reply", "team:view"] }
   * @responseBody 200 - { "data": { "role": "support_lead" } }
   * @responseBody 403 - { "error": "Permission denied: roles:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Cannot grant permissions you do not hold", "code": "E_PERMISSION_ESCALATION" }
   */
  async create({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createRoleValidator)

    try {
      const role = await new RoleService().createRole({
        organizationId: request.activeMember!.organizationId,
        name: payload.name,
        permissions: payload.permissions,
        actorUserId: request.authUser!.id,
        managerPermissions: request.memberPermissions!,
      })
      return serialize({ role })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @preview
   * @summary Preview a role permission update (read-only)
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Role key e.g. agent - @type(string)
   * @requestBody { "permissions": ["inbox:view", "contacts:view"] }
   * @responseBody 200 - { "data": { "role": "agent", "isSystem": true, "permissionsAdded": [], "permissionsRemoved": ["inbox:reply"], "affectedMembers": [{ "id": "uuid", "userId": "uuid" }] } }
   * @responseBody 403 - { "error": "Permission denied: roles:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Role \"owner\" is protected", "code": "E_ROLE_PROTECTED" }
   */
  async preview({ request, params, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(previewRoleUpdateValidator)

    try {
      const preview = await new RoleService().previewRoleUpdate({
        organizationId: request.activeMember!.organizationId,
        roleKey: params.roleKey,
        newPermissions: payload.permissions,
      })
      return serialize(preview)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @update
   * @summary Update a role's permissions
   * @description Custom roles rewrite role_permissions. System roles admin/agent/viewer write organization_role_permissions overrides. Requires a reason (audited).
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Role key e.g. agent - @type(string)
   * @requestBody { "permissions": ["inbox:view", "inbox:reply"], "reason": "Narrow agent inbox access" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: roles:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Cannot grant permissions you do not hold", "code": "E_PERMISSION_ESCALATION" }
   */
  async update({ request, params, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(updateRoleValidator)

    try {
      await new RoleService().updateRole({
        organizationId: request.activeMember!.organizationId,
        roleKey: params.roleKey,
        newPermissions: payload.permissions,
        reason: payload.reason,
        actorUserId: request.authUser!.id,
        managerPermissions: request.memberPermissions!,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @reset
   * @summary Reset a system role to seeded defaults
   * @description Deletes all organization_role_permissions overrides for admin/agent/viewer. Custom roles cannot be reset.
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - System role key e.g. agent - @type(string)
   * @requestBody { "reason": "Restore default agent permissions" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 422 - { "error": "Only system roles can be reset to defaults", "code": "E_ROLE_RESET_CUSTOM" }
   */
  async reset({ request, params, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(resetRoleValidator)

    try {
      await new RoleService().resetRole({
        organizationId: request.activeMember!.organizationId,
        roleKey: params.roleKey,
        reason: payload.reason,
        actorUserId: request.authUser!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @destroy
   * @summary Delete a custom role and reassign its members
   * @description System roles cannot be deleted. Requires replacementRole and a reason. Also re-points invitations and user_roles.
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Custom role key to delete - @type(string)
   * @requestBody { "replacementRole": "viewer", "reason": "Consolidating support roles" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: roles:manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Replacement role \"viewer\" does not exist", "code": "E_ROLE_REPLACEMENT_MISSING" }
   */
  async destroy({ request, params, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(deleteRoleValidator)

    try {
      await new RoleService().deleteRole({
        organizationId: request.activeMember!.organizationId,
        roleKey: params.roleKey,
        replacementRole: payload.replacementRole,
        reason: payload.reason,
        actorUserId: request.authUser!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
