import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Tenant integration connection management errors.
 */
export default class IntegrationConnectionException extends Exception {
  static unsupportedProvider(provider: string) {
    return new this(`Provider "${provider}" is not available`, {
      status: 422,
      code: 'E_INTEGRATION_PROVIDER_UNSUPPORTED',
    })
  }

  static notFound() {
    return new this('Integration connection not found', {
      status: 404,
      code: 'E_INTEGRATION_CONNECTION_NOT_FOUND',
    })
  }

  static configContainsSecret() {
    return new this('Connection config cannot include secret keys', {
      status: 422,
      code: 'E_INTEGRATION_CONFIG_SECRET',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
