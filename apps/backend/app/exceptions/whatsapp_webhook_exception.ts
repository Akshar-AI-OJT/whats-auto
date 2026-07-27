import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Platform WhatsApp webhook auth / verification failures.
 */
export default class WhatsappWebhookException extends Exception {
  static invalidVerifyToken() {
    return new this('Invalid WhatsApp webhook verify token', {
      status: 403,
      code: 'E_WA_WEBHOOK_VERIFY_TOKEN',
    })
  }

  static invalidSignature() {
    return new this('Invalid WhatsApp webhook signature', {
      status: 403,
      code: 'E_WA_WEBHOOK_SIGNATURE',
    })
  }

  static missingRawBody() {
    return new this('Missing raw request body for signature verification', {
      status: 400,
      code: 'E_WA_WEBHOOK_RAW_BODY',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }

  report(error: this, { logger }: HttpContext) {
    logger.warn({ code: error.code }, error.message)
  }
}
