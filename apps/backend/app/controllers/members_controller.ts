import type { HttpContext } from '@adonisjs/core/http'
import { MemberService } from '#services/member_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { assignMemberRoleValidator } from '#validators/organization'
import '#types/http'

export default class MembersController {
  /**
   * @index
   * @summary List members of the active organization
   * @tag Members
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "userId": "uuid", "role": "agent", "email": "agent@example.com", "name": "Ada Agent" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: team:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const members = await new MemberService().listMembers(request.activeMember!.organizationId)
    return serialize(members)
  }

  /**
   * @assignRole
   * @summary Assign a role to a member
   * @description Cannot change your own role, assign owner, or change the current owner's role (use ownership transfer).
   * @tag Members
   * @security BearerAuth
   * @paramPath memberId - Organization member id - @type(string)
   * @requestBody { "role": "agent" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: team:role_assign", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Cannot change your own role", "code": "E_ROLE_SELF_ASSIGN" }
   */
  async assignRole({ request, params, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(assignMemberRoleValidator)

    try {
      await new MemberService().assignRole({
        organizationId: request.activeMember!.organizationId,
        memberId: params.memberId,
        newRole: payload.role,
        actorUserId: request.authUser!.id,
        managerPermissions: request.memberPermissions!,
        actorMemberId: request.activeMember!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @remove
   * @summary Remove a member from the organization
   * @description Cannot remove the owner — transfer ownership first.
   * @tag Members
   * @security BearerAuth
   * @paramPath memberId - Organization member id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: team:remove", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Cannot remove the Owner. Transfer ownership first.", "code": "E_MEMBER_REMOVE_OWNER" }
   */
  async remove({ request, params, response, serialize }: HttpContext) {
    try {
      await new MemberService().removeMember({
        organizationId: request.activeMember!.organizationId,
        memberId: params.memberId,
        actorUserId: request.authUser!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
