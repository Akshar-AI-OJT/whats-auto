import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class LlmException extends Exception {
  static missingApiKey() {
    return new this('OPENAI_API_KEY is required for the OpenAI LLM driver', {
      status: 503,
      code: 'E_LLM_MISSING_API_KEY',
    })
  }

  static emptyCompletion() {
    return new this('LLM returned an empty completion', {
      status: 502,
      code: 'E_LLM_EMPTY_COMPLETION',
    })
  }

  static emptyEmbedding() {
    return new this('LLM returned an empty embedding', {
      status: 502,
      code: 'E_LLM_EMPTY_EMBEDDING',
    })
  }

  static providerFailed(cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'LLM provider request failed'
    return new this(message, {
      status: 502,
      code: 'E_LLM_PROVIDER_FAILED',
      cause,
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }

  report(error: this, { logger }: HttpContext) {
    if (error.status >= 500) {
      logger.error({ code: error.code }, error.message)
      return
    }
    logger.warn({ code: error.code }, error.message)
  }
}
