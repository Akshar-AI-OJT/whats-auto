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

  static notCancellable(status: string) {
    return this.notEligibleToCancel(status)
  }

  static templateRequired() {
    return this.templateNotConfigured()
  }

  static whatsappConfigRequired() {
    return this.whatsappConfigNotConfigured()
  }

  static recipientsRequired() {
    return new this('Campaign must have at least one recipient', {
      status: 422,
      code: 'E_CAMPAIGN_RECIPIENTS_REQUIRED',
    })
  }

  static notEditable(status: string) {
    return new this(`Campaign with status "${status}" is not editable`, {
      status: 422,
      code: 'E_CAMPAIGN_NOT_EDITABLE',
    })
  }

  static scheduledAtMustBeFuture() {
    return new this('scheduledAt must be in the future', {
      status: 422,
      code: 'E_CAMPAIGN_SCHEDULED_AT_MUST_BE_FUTURE',
    })
  }

  static invalidScheduledAt() {
    return new this('scheduledAt is not a valid datetime', {
      status: 422,
      code: 'E_CAMPAIGN_INVALID_SCHEDULED_AT',
    })
  }

  static invalidTimeZone() {
    return new this('timeZone is not a valid IANA timezone', {
      status: 422,
      code: 'E_CAMPAIGN_INVALID_TIMEZONE',
    })
  }

  static invalidReference() {
    return new this('One or more campaign references are invalid', {
      status: 422,
      code: 'E_CAMPAIGN_INVALID_REFERENCE',
    })
  }

  static tagNotFound() {
    return new this('Tag not found', {
      status: 404,
      code: 'E_CAMPAIGN_TAG_NOT_FOUND',
    })
  }

  static recipientsAudienceRequired() {
    return new this('Provide either contactIds or tagId', {
      status: 422,
      code: 'E_CAMPAIGN_RECIPIENTS_AUDIENCE_REQUIRED',
    })
  }

  static noEligibleRecipients() {
    return new this(
      'Campaign has no eligible recipients after excluding opted-out and deleted contacts',
      {
        status: 422,
        code: 'E_CAMPAIGN_NO_ELIGIBLE_RECIPIENTS',
      }
    )
  }

  static conflictingAudience() {
    return new this('Provide either contactIds or tagId, not both', {
      status: 422,
      code: 'E_CAMPAIGN_CONFLICTING_AUDIENCE',
    })
  }

  static alreadyDeleted() {
    return new this('Campaign is already deleted', {
      status: 409,
      code: 'E_CAMPAIGN_ALREADY_DELETED',
    })
  }

  static templateNotSendable(reason?: string) {
    return new this(reason || 'Campaign template is not sendable', {
      status: 422,
      code: 'E_CAMPAIGN_TEMPLATE_NOT_SENDABLE',
    })
  }

  static missingTemplateParameters(detail: string) {
    return new this(detail, {
      status: 422,
      code: 'E_CAMPAIGN_MISSING_TEMPLATE_PARAMETERS',
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
