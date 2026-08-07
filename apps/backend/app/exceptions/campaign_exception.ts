import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Campaign (broadcast) domain errors with stable API codes.
 */
export default class CampaignException extends Exception {
  static notFound() {
    return new this('Campaign not found', {
      status: 404,
      code: 'E_CAMPAIGN_NOT_FOUND',
    })
  }

  static scheduledAtRequired() {
    return new this('scheduledAt is required when status is scheduled', {
      status: 422,
      code: 'E_CAMPAIGN_SCHEDULED_AT_REQUIRED',
    })
  }

  static whatsappConfigNotFound() {
    return new this('WhatsApp configuration not found for this organization', {
      status: 422,
      code: 'E_CAMPAIGN_WA_CONFIG_NOT_FOUND',
    })
  }

  static messageTemplateNotFound() {
    return new this('Message template not found for this organization', {
      status: 422,
      code: 'E_CAMPAIGN_TEMPLATE_NOT_FOUND',
    })
  }

  static invalidReference() {
    return new this('One or more campaign references are invalid', {
      status: 422,
      code: 'E_CAMPAIGN_INVALID_REFERENCE',
    })
  }

  static alreadyDeleted() {
    return new this('Campaign is already deleted', {
      status: 409,
      code: 'E_CAMPAIGN_ALREADY_DELETED',
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
