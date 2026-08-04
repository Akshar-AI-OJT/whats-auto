import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Inbox message domain errors with stable API codes.
 */
export default class MessageException extends Exception {
  static conversationClosed() {
    return new this('Cannot reply to a closed conversation', {
      status: 422,
      code: 'E_CONVERSATION_CLOSED',
    })
  }

  static mediaNotFound() {
    return new this('Media asset not found', {
      status: 404,
      code: 'E_MESSAGE_MEDIA_NOT_FOUND',
    })
  }

  static mediaLinkUnavailable() {
    return new this('Media asset does not have a publicly accessible URL for WhatsApp delivery', {
      status: 422,
      code: 'E_MESSAGE_MEDIA_LINK_UNAVAILABLE',
    })
  }

  static whatsappNotConnected() {
    return new this('WhatsApp configuration is not connected', {
      status: 422,
      code: 'E_WA_NOT_CONNECTED',
    })
  }

  static metaGraphFailed(message: string, status = 502) {
    return new this(message, {
      status,
      code: 'E_MESSAGE_META_GRAPH_FAILED',
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
