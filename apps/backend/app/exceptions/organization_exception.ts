import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Organization domain errors with stable API codes.
 */
export default class OrganizationException extends Exception {
  static notFound() {
    return new this('Organization not found', {
      status: 404,
      code: 'E_ORG_NOT_FOUND',
    })
  }

  static slugAlreadyExists(slug: string) {
    return new this(`Organization slug "${slug}" is already in use. Please choose another.`, {
      status: 409,
      code: 'E_ORG_SLUG_ALREADY_EXISTS',
    })
  }

  static paymentRequired() {
    return new this('Complete payment to activate this organization before using the product.', {
      status: 402,
      code: 'E_ORG_PAYMENT_REQUIRED',
    })
  }

  static profileIncomplete() {
    return new this('Complete the organization profile before accessing this functionality.', {
      status: 403,
      code: 'E_ORGANIZATION_PROFILE_INCOMPLETE',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
      ...(error.code === 'E_ORG_SLUG_ALREADY_EXISTS' ? { field: 'slug' } : {}),
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
