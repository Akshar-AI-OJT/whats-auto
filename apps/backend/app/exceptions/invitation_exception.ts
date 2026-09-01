import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Invitation lifecycle conflicts with stable API codes.
 */
export default class InvitationException extends Exception {
  static alreadyPending() {
    return new this('A pending invitation already exists for this email', {
      status: 409,
      code: 'E_INVITE_ALREADY_PENDING',
    })
  }

  static organizationNotProvisioned() {
    return new this('Complete payment before inviting members to this organization', {
      status: 402,
      code: 'E_ORG_PAYMENT_REQUIRED',
    })
  }

  static emailSendFailed(detail?: string) {
    return new this(
      detail ? `Failed to send invite email: ${detail}` : 'Failed to send invite email',
      {
        status: 502,
        code: 'E_INVITE_EMAIL_FAILED',
      }
    )
  }

  static superadminNotInvitable() {
    return new this('Platform superadmin accounts cannot be invited to organizations.', {
      status: 422,
      code: 'E_SUPERADMIN_NOT_INVITABLE',
    })
  }

  static ownerNotInvitable() {
    return new this('The owner of this organization cannot be re-invited.', {
      status: 422,
      code: 'E_INVITE_OWNER_PROTECTED',
    })
  }

  static alreadyMember() {
    return new this('User is already a member of this organization', {
      status: 422,
      code: 'E_INVITE_ALREADY_MEMBER',
    })
  }

  static passwordAlreadySet() {
    return new this('This user has already set their password and cannot be re-invited.', {
      status: 422,
      code: 'E_INVITE_PASSWORD_ALREADY_SET',
    })
  }

  static setupNotFound() {
    return new this('No invitation record found for this user.', {
      status: 404,
      code: 'E_INVITE_NOT_FOUND',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
