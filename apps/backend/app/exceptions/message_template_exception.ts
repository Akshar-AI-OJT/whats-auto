import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Message template domain errors with stable API codes.
 */
export default class MessageTemplateException extends Exception {
  static notFound() {
    return new this('Message template not found', {
      status: 404,
      code: 'E_MESSAGE_TEMPLATE_NOT_FOUND',
    })
  }

  static duplicateName(name: string, language: string) {
    return new this(`Template "${name}" (${language}) already exists for this organization`, {
      status: 409,
      code: 'E_MESSAGE_TEMPLATE_DUPLICATE',
    })
  }

  static noActiveWhatsappConfig() {
    return new this('No connected WhatsApp configuration found for this organization', {
      status: 422,
      code: 'E_WA_CONFIG_NOT_FOUND',
    })
  }

  static metaGraphFailed(message: string, status = 502) {
    return new this(message, {
      status,
      code: 'E_TEMPLATE_META_GRAPH_FAILED',
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
