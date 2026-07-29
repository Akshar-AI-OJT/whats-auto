import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * WhatsApp config / Embedded Signup domain errors with stable API codes.
 */
export default class WhatsappConfigException extends Exception {
  static notFound() {
    return new this('WhatsApp config not found', {
      status: 404,
      code: 'E_WA_CONFIG_NOT_FOUND',
    })
  }

  static phoneNumberOwnedByAnotherOrg() {
    return new this('This WhatsApp phone number is already connected to another organization', {
      status: 409,
      code: 'E_WA_PHONE_OWNED',
    })
  }

  static notConnected() {
    return new this('WhatsApp config is not connected', {
      status: 422,
      code: 'E_WA_NOT_CONNECTED',
    })
  }

  static orgInactive() {
    return new this('Organization is inactive or deleted', {
      status: 422,
      code: 'E_WA_ORG_INACTIVE',
    })
  }

  static metaGraphFailed(message: string, status = 502) {
    return new this(message, {
      status,
      code: 'E_WA_META_GRAPH',
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
