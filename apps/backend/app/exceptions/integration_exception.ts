import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Public integration ingress errors (generic CRM + Shopenup).
 */
export default class IntegrationException extends Exception {
  static unmappedEvent() {
    return new this('Unsupported integration event type', {
      status: 422,
      code: 'E_INTEGRATION_EVENT_UNMAPPED',
    })
  }

  static missingEventId() {
    return new this('Missing external event id', {
      status: 422,
      code: 'E_INTEGRATION_EVENT_ID_MISSING',
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
