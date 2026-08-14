import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class PlatformAiConfigException extends Exception {
  static notFound() {
    return new this('Platform AI config not found', {
      status: 404,
      code: 'E_PLATFORM_AI_CONFIG_NOT_FOUND',
    })
  }

  static invalidSummaryThreshold() {
    return new this('summaryTurnThreshold must be greater than or equal to workingSetSize', {
      status: 422,
      code: 'E_PLATFORM_AI_CONFIG_SUMMARY_THRESHOLD',
    })
  }

  static missingApiKey() {
    return new this('OPENAI_API_KEY is required when platform AI is enabled', {
      status: 503,
      code: 'E_PLATFORM_AI_MISSING_API_KEY',
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
