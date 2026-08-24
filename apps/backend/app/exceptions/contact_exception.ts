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

  static importInvalidFile() {
    return new this('Upload a CSV file', {
      status: 422,
      code: 'E_CONTACT_IMPORT_INVALID_FILE',
    })
  }

  static importEmpty() {
    return new this('CSV file has no contact rows', {
      status: 422,
      code: 'E_CONTACT_IMPORT_EMPTY',
    })
  }

  static importMalformed() {
    return new this('CSV file could not be parsed', {
      status: 422,
      code: 'E_CONTACT_IMPORT_MALFORMED',
    })
  }

  static importMissingPhoneColumn() {
    return new this('CSV is missing a phone column', {
      status: 422,
      code: 'E_CONTACT_IMPORT_MISSING_PHONE_COLUMN',
    })
  }

  static importTooManyRows() {
    return new this('CSV has too many rows', {
      status: 422,
      code: 'E_CONTACT_IMPORT_TOO_MANY_ROWS',
    })
  }

  static importInvalidCountry() {
    return new this('Invalid country code', {
      status: 422,
      code: 'E_CONTACT_IMPORT_INVALID_COUNTRY',
    })
  }

  static duplicatePhone() {
    return new this('A contact with this phone number already exists', {
      status: 409,
      code: 'E_CONTACT_PHONE_EXISTS',
    })
  }

  static notFound() {
    return new this('Contact not found', {
      status: 404,
      code: 'E_CONTACT_NOT_FOUND',
    })
  }

  static alreadyDeleted() {
    return new this('Contact is already deleted', {
      status: 409,
      code: 'E_CONTACT_ALREADY_DELETED',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
