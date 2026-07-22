import type { HttpContext } from '@adonisjs/core/http'
import { RoleService } from '#services/role_service'
import { mapRbacError } from '#lib/map_rbac_error'
import {
  createRoleValidator,
  deleteRoleValidator,
  previewRoleUpdateValidator,
  updateRoleValidator,
} from '#validators/organization'
import '#types/http'

export default class RolesController {
  /**
   * @summary List dynamic roles for the active organization
   * @tag Roles
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "role": "agent", "displayName": "Agent", "permissions": ["inbox:view"] }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "No active organization. Call /api/auth/organization/set-active first.", "code": "NO_ACTIVE_ORG" }
   */
  async index({ request, serialize }: HttpContext) {
    const roles = await new RoleService().listRoles(request.activeMember!.organizationId)
    return serialize(roles)
  }

  /**
   * @summary Create a dynamic role
   * @description Slugifies displayName into an immutable role key. Cannot escalate beyond the caller's permissions. Cannot create reserved key "owner".
   * @tag Roles
   * @security BearerAuth
   * @requestBody { "displayName": "Support Lead", "permissions": ["inbox:view", "inbox:reply", "team:view"] }
   * @responseBody 200 - { "data": { "role": "support_lead" } }
   * @responseBody 403 - { "error": "Permission denied: roles:create", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Cannot grant permissions you do not hold", "code": "E_PERMISSION_ESCALATION" }
   */
  async create({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createRoleValidator)

    try {
      const role = await new RoleService().createRole({
        organizationId: request.activeMember!.organizationId,
        displayName: payload.displayName,
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
   * @summary Preview a role permission update (read-only)
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Role key e.g. agent - @type(string)
   * @requestBody { "permissions": ["inbox:view", "contacts:view"] }
   * @responseBody 200 - { "data": { "displayName": "Agent", "permissionsAdded": [], "permissionsRemoved": ["inbox:reply"], "affectedMembers": [{ "id": "uuid", "userId": "uuid" }] } }
   * @responseBody 403 - { "error": "Permission denied: roles:edit", "code": "PERMISSION_DENIED" }
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
   * @summary Update a role's permissions
   * @description Requires a reason (audited). Cannot escalate beyond the caller's permissions.
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Role key e.g. agent - @type(string)
   * @requestBody { "permissions": ["inbox:view", "inbox:reply"], "reason": "Narrow agent inbox access" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: roles:edit", "code": "PERMISSION_DENIED" }
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
   * @summary Delete a role and reassign its members
   * @description Requires replacementRole (existing, not owner, not the deleted key) and a reason.
   * @tag Roles
   * @security BearerAuth
   * @paramPath roleKey - Role key to delete - @type(string)
   * @requestBody { "replacementRole": "viewer", "reason": "Consolidating support roles" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: roles:delete", "code": "PERMISSION_DENIED" }
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
