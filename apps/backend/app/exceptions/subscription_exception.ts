import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Subscription domain errors with stable API codes.
 */
export default class SubscriptionException extends Exception {
  static notFound() {
    return new this('Subscription Not Found', {
      status: 404,
      code: 'E_SUBSCRIPTION_NOT_FOUND',
    })
  }

  static organizationNotFound() {
    return new this('Organization Not Found', {
      status: 404,
      code: 'E_ORGANIZATION_NOT_FOUND',
    })
  }

  static planNotFound() {
    return new this('Plan Not Found', {
      status: 404,
      code: 'E_PLAN_NOT_FOUND',
    })
  }

  static invalidPeriod() {
    return new this('currentPeriodEnd must be after currentPeriodStart', {
      status: 422,
      code: 'E_SUBSCRIPTION_INVALID_PERIOD',
    })
  }

  static alreadyDeleted() {
    return new this('Subscription is already deleted', {
      status: 409,
      code: 'E_SUBSCRIPTION_ALREADY_DELETED',
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
