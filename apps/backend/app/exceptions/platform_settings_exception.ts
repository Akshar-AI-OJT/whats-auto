import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class PlatformSettingsException extends Exception {
  static notFound() {
    return new this('Platform settings not found', {
      status: 404,
      code: 'E_PLATFORM_SETTINGS_NOT_FOUND',
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
