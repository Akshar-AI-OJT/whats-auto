import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Platform billing domain errors (checkout, entitlements, gateway).
 */
export default class BillingException extends Exception {
  static planNotFound() {
    return new this('Plan not found', {
      status: 404,
      code: 'E_BILLING_PLAN_NOT_FOUND',
    })
  }

  static planNotCheckoutable() {
    return new this('Plan is not available for Razorpay checkout', {
      status: 422,
      code: 'E_BILLING_PLAN_NOT_CHECKOUTABLE',
    })
  }

  static organizationNotFound() {
    return new this('Organization not found', {
      status: 404,
      code: 'E_BILLING_ORGANIZATION_NOT_FOUND',
    })
  }

  static subscriptionNotFound() {
    return new this('Subscription not found', {
      status: 404,
      code: 'E_BILLING_SUBSCRIPTION_NOT_FOUND',
    })
  }

  static gatewayFailed(message: string) {
    return new this(message, {
      status: 502,
      code: 'E_BILLING_GATEWAY_FAILED',
    })
  }

  static invalidSignature() {
    return new this('Invalid payment signature', {
      status: 400,
      code: 'E_BILLING_INVALID_SIGNATURE',
    })
  }

  static orderNotFound() {
    return new this('Billing order not found', {
      status: 404,
      code: 'E_BILLING_ORDER_NOT_FOUND',
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
