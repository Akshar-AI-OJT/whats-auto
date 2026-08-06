import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Outbound queue / dispatch domain errors. Never include tokens or template param values.
 */
export default class WhatsappOutboundException extends Exception {
  static conversationNotFound() {
    return new this('Conversation not found', {
      status: 404,
      code: 'E_OUTBOUND_CONVERSATION_NOT_FOUND',
    })
  }

  static configNotConnected() {
    return new this('WhatsApp configuration is not connected', {
      status: 422,
      code: 'E_OUTBOUND_CONFIG_NOT_CONNECTED',
    })
  }

  static conversationConfigMismatch() {
    return new this('Conversation WhatsApp configuration does not match the connected config', {
      status: 422,
      code: 'E_OUTBOUND_CONVERSATION_CONFIG_MISMATCH',
    })
  }

  static templateNotFound() {
    return new this('Message template not found', {
      status: 404,
      code: 'E_OUTBOUND_TEMPLATE_NOT_FOUND',
    })
  }

  static templateNotApproved() {
    return new this('Message template is not approved for sending', {
      status: 422,
      code: 'E_OUTBOUND_TEMPLATE_NOT_APPROVED',
    })
  }

  static templateNotSendable(reason: string) {
    return new this(reason || 'Message template cannot be sent with the current parameter schema', {
      status: 422,
      code: 'E_OUTBOUND_TEMPLATE_NOT_SENDABLE',
    })
  }

  static invalidTemplateParameters(message: string) {
    return new this(message, {
      status: 422,
      code: 'E_OUTBOUND_TEMPLATE_PARAMS',
    })
  }

  static dispatchNotFound() {
    return new this('Outbound dispatch not found', {
      status: 404,
      code: 'E_OUTBOUND_DISPATCH_NOT_FOUND',
    })
  }

  static emptyText() {
    return new this('Outbound text body must be a non-empty string', {
      status: 422,
      code: 'E_OUTBOUND_EMPTY_TEXT',
    })
  }

  static mediaTypeNotAllowedForChannel(mediaType: string, channel: string) {
    return new this(`Media type "${mediaType}" is not allowed for ${channel} sends`, {
      status: 422,
      code: 'E_OUTBOUND_MEDIA_CHANNEL_DENIED',
    })
  }

  static idempotencyKeyConflict() {
    return new this('Idempotency-Key was reused with a different payload', {
      status: 422,
      code: 'E_IDEMPOTENCY_KEY_CONFLICT',
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
