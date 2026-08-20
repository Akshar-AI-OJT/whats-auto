import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Tenant API key auth and management errors.
 */
export default class ApiKeyException extends Exception {
  static missing() {
    return new this('Missing API key', {
      status: 401,
      code: 'E_API_KEY_MISSING',
    })
  }

  static invalid() {
    return new this('Invalid or expired API key', {
      status: 401,
      code: 'E_API_KEY_INVALID',
    })
  }

  static insufficientScope() {
    return new this('Insufficient API key permissions', {
      status: 403,
      code: 'E_API_KEY_SCOPE',
    })
  }

  static notFound() {
    return new this('API key not found', {
      status: 404,
      code: 'E_API_KEY_NOT_FOUND',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
