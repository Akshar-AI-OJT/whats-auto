import type { HttpContext } from '@adonisjs/core/http'
import MemberPolicy from '#policies/member_policy'
import InvitationPolicy from '#policies/invitation_policy'
import { MemberService } from '#services/member_service'
import { InvitationService } from '#services/invitation_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { assignMemberRoleValidator } from '#validators/organization'
import '#types/http'

export default class MembersController {
  /**
   * @index
   * @summary List members of the active organization
   * @description Returns members of the caller's active organization. Soft-deleted memberships are excluded.
   * @tag Members
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "userId": "uuid", "name": "Ada Agent", "email": "agent@example.com", "role": "agent", "createdAt": "2026-01-01T00:00:00.000Z" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: team:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(MemberPolicy).authorize('viewList')

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
  async assignRole({ bouncer, request, params, response, serialize }: HttpContext) {
    const member = await new MemberService().getMemberById({
      organizationId: request.activeMember!.organizationId,
      memberId: params.memberId,
    })

    if (!member) {
      return response.notFound({
        error: 'Member not found',
        code: 'E_MEMBER_NOT_FOUND',
      })
    }

    await bouncer.with(MemberPolicy).authorize('assignRole', member)

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
  async remove({ bouncer, request, params, response, serialize }: HttpContext) {
    const member = await new MemberService().getMemberById({
      organizationId: request.activeMember!.organizationId,
      memberId: params.memberId,
    })

    if (!member) {
      return response.notFound({
        error: 'Member not found',
        code: 'E_MEMBER_NOT_FOUND',
      })
    }

    await bouncer.with(MemberPolicy).authorize('remove', member)

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

  /**
   * @resendInvite
   * @summary Resend password setup email for an unverified teammate
   * @tag Members
   * @security BearerAuth
   * @paramPath memberId - Organization member id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   */
  async resendInvite({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.with(InvitationPolicy).authorize('resend')

    try {
      const result = await new InvitationService().resendSetupEmail({
        memberId: params.memberId,
        organizationId: request.activeMember!.organizationId,
        actorUserId: request.authUser!.id,
      })
      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
