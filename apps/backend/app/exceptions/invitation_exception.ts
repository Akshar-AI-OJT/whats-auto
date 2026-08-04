import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Invitation lifecycle conflicts with stable API codes.
 */
export default class InvitationException extends Exception {
  static pendingInvitationBlocksOrgCreation() {
    return new this('Accept or decline your pending invitation before creating an organization', {
      status: 409,
      code: 'E_INVITE_PENDING',
    })
  }

  static alreadyPending() {
    return new this('A pending invitation already exists for this email', {
      status: 409,
      code: 'E_INVITE_ALREADY_PENDING',
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

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
