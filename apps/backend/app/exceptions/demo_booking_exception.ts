import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Public Book Demo domain errors with stable API codes.
 */
export default class DemoBookingException extends Exception {
  static invalidDate() {
    return new this('Provide a valid date as YYYY-MM-DD', {
      status: 422,
      code: 'E_DEMO_DATE_INVALID',
    })
  }

  static invalidTimeZone() {
    return new this('timeZone is not a valid IANA timezone', {
      status: 422,
      code: 'E_DEMO_TIMEZONE_INVALID',
    })
  }

  static invalidSlot() {
    return new this('The selected time slot is not valid', {
      status: 422,
      code: 'E_DEMO_SLOT_INVALID',
    })
  }

  static slotUnavailable() {
    return new this('This time slot is no longer available', {
      status: 409,
      code: 'E_DEMO_SLOT_UNAVAILABLE',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
