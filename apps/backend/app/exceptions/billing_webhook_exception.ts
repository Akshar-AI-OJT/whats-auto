import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Platform Razorpay billing webhook auth failures.
 */
export default class BillingWebhookException extends Exception {
  static invalidSignature() {
    return new this('Invalid Razorpay billing webhook signature', {
      status: 403,
      code: 'E_BILLING_WEBHOOK_SIGNATURE',
    })
  }

  static missingRawBody() {
    return new this('Missing raw request body for signature verification', {
      status: 400,
      code: 'E_BILLING_WEBHOOK_RAW_BODY',
    })
  }

  static invalidPayload() {
    return new this('Invalid Razorpay webhook payload', {
      status: 400,
      code: 'E_BILLING_WEBHOOK_PAYLOAD',
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
