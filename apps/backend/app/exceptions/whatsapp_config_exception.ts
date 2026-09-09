import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * WhatsApp config / Embedded Signup domain errors with stable API codes.
 */
export default class WhatsappConfigException extends Exception {
  details?: Record<string, unknown>

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

  static phoneRequired() {
    return new this(
      'A verified WhatsApp business phone number is required. Complete Embedded Signup with a phone number (FINISH_ONLY_WABA is not enough).',
      {
        status: 422,
        code: 'E_WA_PHONE_REQUIRED',
      }
    )
  }

  static metaAccountUnusable(message?: string, details?: Record<string, unknown>) {
    const error = new this(
      message ??
        'No valid Meta Business Portfolio / WhatsApp account was linked. Create or select a Business Portfolio in Embedded Signup and try again.',
      {
        status: 422,
        code: 'E_META_ACCOUNT_UNUSABLE',
      }
    )
    error.details = details
    return error
  }

  static metaPortfolioUnverified(details: {
    businessId: string
    verificationStatus: string
    helpUrl?: string
  }) {
    const error = new this(
      'Your Meta Business Portfolio is not verified. Meta Business Verification is required before you can subscribe.',
      {
        status: 422,
        code: 'E_META_PORTFOLIO_UNVERIFIED',
      }
    )
    error.details = {
      businessId: details.businessId,
      verificationStatus: details.verificationStatus,
      helpUrl: details.helpUrl ?? 'https://business.facebook.com/settings/security',
    }
    return error
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
      ...(error.details ? { details: error.details } : {}),
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
