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

  static templateNotConfigured() {
    return new this('Campaign has no message template configured', {
      status: 422,
      code: 'E_CAMPAIGN_TEMPLATE_NOT_CONFIGURED',
    })
  }

  static whatsappConfigNotConfigured() {
    return new this('Campaign has no WhatsApp configuration configured', {
      status: 422,
      code: 'E_CAMPAIGN_WA_CONFIG_NOT_CONFIGURED',
    })
  }

  static notEligibleToSend(status: string) {
    return new this(`Campaign with status "${status}" is not eligible to send`, {
      status: 422,
      code: 'E_CAMPAIGN_NOT_ELIGIBLE_TO_SEND',
    })
  }

  static notEligibleToSchedule(status: string) {
    return new this(`Campaign with status "${status}" is not eligible to schedule`, {
      status: 422,
      code: 'E_CAMPAIGN_NOT_ELIGIBLE_TO_SCHEDULE',
    })
  }

  static notEligibleToCancel(status: string) {
    return new this(`Campaign with status "${status}" is not eligible to cancel schedule`, {
      status: 422,
      code: 'E_CAMPAIGN_NOT_ELIGIBLE_TO_CANCEL',
    })
  }

  static scheduledAtMustBeFuture() {
    return new this('scheduledAt must be in the future', {
      status: 422,
      code: 'E_CAMPAIGN_SCHEDULED_AT_MUST_BE_FUTURE',
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

  static recipientsRequired() {
    return new this('Campaign requires at least one recipient before schedule or send', {
      status: 422,
      code: 'E_CAMPAIGN_RECIPIENTS_REQUIRED',
    })
  }

  /** Alias used by execution paths — same meaning as templateNotConfigured. */
  static templateRequired() {
    return this.templateNotConfigured()
  }

  /** Alias used by execution paths — same meaning as whatsappConfigNotConfigured. */
  static whatsappConfigRequired() {
    return this.whatsappConfigNotConfigured()
  }

  static notEditable(status: string) {
    return new this(`Campaign cannot be edited while status is ${status}`, {
      status: 409,
      code: 'E_CAMPAIGN_NOT_EDITABLE',
    })
  }

  static notCancellable(status: string) {
    return this.notEligibleToCancel(status)
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
