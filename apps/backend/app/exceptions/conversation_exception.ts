import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Conversation (inbox) domain errors with stable API codes.
 */
export default class ConversationException extends Exception {
  static notFound() {
    return new this('Conversation not found', {
      status: 404,
      code: 'E_CONVERSATION_NOT_FOUND',
    })
  }

  static contactNotFound() {
    return new this('Contact not found', {
      status: 404,
      code: 'E_CONTACT_NOT_FOUND',
    })
  }

  static whatsappConfigNotFound() {
    return new this('WhatsApp configuration not found', {
      status: 404,
      code: 'E_WA_CONFIG_NOT_FOUND',
    })
  }

  static agentNotFound() {
    return new this('Assigned agent is not a member of this organization', {
      status: 404,
      code: 'E_AGENT_NOT_FOUND',
    })
  }

  static duplicateActive() {
    return new this('An active conversation already exists for this contact and WhatsApp number', {
      status: 409,
      code: 'E_CONVERSATION_DUPLICATE_ACTIVE',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }

  report(error: this, { logger }: HttpContext) {
    if (error.status >= 500) {
      logger.error({ code: error.code }, error.message)
      return
    }
    logger.warn({ code: error.code }, error.message)
  }
}
