import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Invoice domain errors with stable API codes.
 */
export default class InvoiceException extends Exception {
  static notFound() {
    return new this('Invoice Not Found', {
      status: 404,
      code: 'E_INVOICE_NOT_FOUND',
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

  static subscriptionNotFound() {
    return new this('Subscription Not Found', {
      status: 404,
      code: 'E_SUBSCRIPTION_NOT_FOUND',
    })
  }

  static paymentTransactionNotFound() {
    return new this('Payment Transaction Not Found', {
      status: 404,
      code: 'E_PAYMENT_TRANSACTION_NOT_FOUND',
    })
  }

  static invalidPeriod() {
    return new this('periodEnd must be after periodStart', {
      status: 422,
      code: 'E_INVOICE_INVALID_PERIOD',
    })
  }

  static invalidDueDate() {
    return new this('dueDate must be on or after issueDate', {
      status: 422,
      code: 'E_INVOICE_INVALID_DUE_DATE',
    })
  }

  static invalidLineItems() {
    return new this('At least one line item is required', {
      status: 422,
      code: 'E_INVOICE_LINE_ITEMS_REQUIRED',
    })
  }

  static cannotMarkCancelledPaid() {
    return new this('Cancelled invoices cannot be marked as paid', {
      status: 422,
      code: 'E_INVOICE_CANNOT_MARK_CANCELLED_PAID',
    })
  }

  static actionUnavailable(message = 'This invoice action is not available yet') {
    return new this(message, {
      status: 501,
      code: 'E_INVOICE_ACTION_UNAVAILABLE',
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
