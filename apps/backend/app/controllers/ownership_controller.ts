import type { HttpContext } from '@adonisjs/core/http'
import { OrganizationService } from '#services/organization_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { transferOwnershipValidator } from '#validators/organization'
import '#types/http'

export default class OwnershipController {
  /**
   * @summary Transfer organization ownership
   * @description Only the current owner may call this. Atomically promotes the target member and demotes the current owner to replacementRoleForCurrentOwner.
   * @tag Ownership
   * @security BearerAuth
   * @requestBody { "targetMemberId": "uuid", "replacementRoleForCurrentOwner": "admin", "reason": "Stepping down as day-to-day owner" }
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Only the organization owner can transfer ownership.", "code": "NOT_OWNER" }
   * @responseBody 422 - { "error": "Cannot transfer ownership to the same member", "code": "E_OWNERSHIP_SAME_MEMBER" }
   */
  async transfer({ request, response, serialize }: HttpContext) {
    if (request.activeMember!.role !== 'owner') {
      return response.forbidden({
        error: 'Only the organization owner can transfer ownership.',
        code: 'NOT_OWNER',
      })
    }

    const payload = await request.validateUsing(transferOwnershipValidator)

    try {
      await new OrganizationService().transferOwnership({
        organizationId: request.activeMember!.organizationId,
        currentOwnerMemberId: request.activeMember!.id,
        targetMemberId: payload.targetMemberId,
        replacementRoleForCurrentOwner: payload.replacementRoleForCurrentOwner,
        actorUserId: request.authUser!.id,
        reason: payload.reason,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
