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

  static emailAlreadyExists(email: string) {
    return new this(
      `Organization email "${email}" is already in use. Please use a different email.`,
      {
        status: 409,
        code: 'E_ORG_EMAIL_ALREADY_EXISTS',
      }
    )
  }

  static paymentRequired() {
    return new this('Complete payment to activate this organization before using the product.', {
      status: 402,
      code: 'E_ORG_PAYMENT_REQUIRED',
    })
  }

  handle(error: this, { response }: HttpContext) {
    const field =
      error.code === 'E_ORG_SLUG_ALREADY_EXISTS'
        ? 'slug'
        : error.code === 'E_ORG_EMAIL_ALREADY_EXISTS'
          ? 'email'
          : undefined

    return response.status(error.status).send({
      error: error.message,
      code: error.code,
      ...(field ? { field } : {}),
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
