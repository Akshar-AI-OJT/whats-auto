import type { HttpContext } from '@adonisjs/core/http'
import InvitationPolicy from '#policies/invitation_policy'
import { InvitationService } from '#services/invitation_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { createInvitationValidator } from '#validators/invitation'
import '#types/http'

export default class InvitationsController {
  /**
   * @store
   * @summary Provision a teammate in an organization
   * @description Path `:id` must match the session active organization. Pre-provisions the user, membership, and sends a password-setup email.
   * @tag Invitations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @requestBody { "email": "agent@example.com", "firstname": "Ada", "lastname": "Agent", "role": "agent", "designation": "Support" }
   * @responseBody 200 - { "data": { "userId": "uuid", "email": "agent@example.com", "role": "agent", "emailSent": true } }
   * @responseBody 403 - { "error": "Permission denied: team:invite", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Platform superadmin accounts cannot be invited to organizations.", "code": "E_SUPERADMIN_NOT_INVITABLE" }
   */
  async store({ bouncer, request, params, response, serialize }: HttpContext) {
    await bouncer.with(InvitationPolicy).authorize('store', params.id)

    const payload = await request.validateUsing(createInvitationValidator)

    try {
      const result = await new InvitationService().provisionTeammate({
        organizationId: params.id,
        inviterId: request.authUser!.id,
        email: payload.email,
        firstname: payload.firstname,
        lastname: payload.lastname,
        role: payload.role,
        designation: payload.designation,
      })
      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
