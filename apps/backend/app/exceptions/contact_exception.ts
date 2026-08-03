import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Contact domain conflicts with stable API codes.
 */
export default class ContactException extends Exception {
  static invalidPhone() {
    return new this('Enter a valid phone number', {
      status: 422,
      code: 'E_CONTACT_PHONE_INVALID',
    })
  }

  static duplicatePhone() {
    return new this('A contact with this phone number already exists', {
      status: 409,
      code: 'E_CONTACT_PHONE_EXISTS',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
