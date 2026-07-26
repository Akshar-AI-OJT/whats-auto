import type { HttpContext } from '@adonisjs/core/http'
import { InvitationService } from '#services/invitation_service'
import { mapRbacError } from '#lib/map_rbac_error'
import { createInvitationValidator } from '#validators/invitation'
import '#types/http'

export default class InvitationsController {
  /**
   * @summary List pending invitations for the active organization
   * @tag Invitations
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "email": "a@b.com", "role": "agent", "inviterName": "Ada", "expiresAt": "2026-07-28T12:00:00.000Z" }] }
   */
  async index({ request, serialize }: HttpContext) {
    const invitations = await new InvitationService().listInvitations(
      request.activeMember!.organizationId
    )
    return serialize(invitations)
  }

  /**
   * @summary Invite a user to an organization
   * @description Path `:id` must match the session active organization.
   * @tag Invitations
   * @security BearerAuth
   * @paramPath id - Organization id - @type(string)
   * @requestBody { "email": "agent@example.com", "role": "agent" }
   * @responseBody 200 - { "data": { "id": "uuid", "email": "agent@example.com", "role": "agent", "status": "pending" } }
   * @responseBody 403 - { "error": "Permission denied: team:invite", "code": "PERMISSION_DENIED" }
   */
  async store({ request, params, response, serialize }: HttpContext) {
    if (params.id !== request.activeMember!.organizationId) {
      return response.forbidden({
        error: 'Organization id does not match the active organization. Call set-active first.',
        code: 'ORG_ID_MISMATCH',
      })
    }

    const payload = await request.validateUsing(createInvitationValidator)

    try {
      const invitation = await new InvitationService().createInvitation({
        organizationId: params.id,
        inviterId: request.authUser!.id,
        email: payload.email,
        role: payload.role,
      })
      return serialize(invitation)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Preview an invitation (public — invitation id is the secret)
   * @tag Invitations
   * @paramPath id - Invitation id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "organizationName": "Acme", "role": "agent", "inviterName": "Ada", "email": "a@b.com", "status": "pending" } }
   */
  async show({ params, response, serialize }: HttpContext) {
    try {
      const preview = await new InvitationService().getInvitationPreview(params.id)
      return serialize(preview)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Accept an invitation
   * @description Caller must be authenticated; email must match the invitation. Creates membership + user_roles.
   * @tag Invitations
   * @security BearerAuth
   * @paramPath id - Invitation id - @type(string)
   * @responseBody 200 - { "data": { "organizationId": "uuid" } }
   * @responseBody 422 - { "error": "Invitation has expired", "code": "E_INVITE_EXPIRED" }
   */
  async accept({ request, params, response, serialize }: HttpContext) {
    try {
      const result = await new InvitationService().acceptInvitation({
        invitationId: params.id,
        userId: request.authUser!.id,
        userEmail: request.authUser!.email,
      })
      return serialize(result)
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Reject an invitation
   * @tag Invitations
   * @security BearerAuth
   * @paramPath id - Invitation id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   */
  async reject({ request, params, response, serialize }: HttpContext) {
    try {
      await new InvitationService().rejectInvitation({
        invitationId: params.id,
        userEmail: request.authUser!.email,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }

  /**
   * @summary Cancel a pending invitation
   * @tag Invitations
   * @security BearerAuth
   * @paramPath id - Invitation id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: team:invite", "code": "PERMISSION_DENIED" }
   */
  async cancel({ request, params, response, serialize }: HttpContext) {
    try {
      await new InvitationService().cancelInvitation({
        invitationId: params.id,
        organizationId: request.activeMember!.organizationId,
        actorUserId: request.authUser!.id,
      })
      return serialize({ ok: true })
    } catch (error) {
      return mapRbacError(error, response)
    }
  }
}
