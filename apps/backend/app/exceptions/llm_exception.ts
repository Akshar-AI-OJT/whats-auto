import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class LlmException extends Exception {
  static missingApiKey(envName = 'OPENAI_API_KEY') {
    return new this(`${envName} is required for the LLM driver`, {
      status: 503,
      code: 'E_LLM_MISSING_API_KEY',
    })
  }

  static unsupportedProvider(provider: string) {
    return new this(`LLM provider "${provider}" is not available yet`, {
      status: 503,
      code: 'E_LLM_UNSUPPORTED_PROVIDER',
    })
  }

  static embeddingDimensionMismatch(actual: number, expected: number) {
    return new this(`Embedding must have ${expected} dimensions, got ${actual}`, {
      status: 502,
      code: 'E_LLM_EMBEDDING_DIMENSION',
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
