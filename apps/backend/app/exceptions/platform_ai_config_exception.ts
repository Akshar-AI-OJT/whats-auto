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

  static missingApiKey(envName = 'OPENAI_API_KEY') {
    return new this(`${envName} is required when platform AI is enabled`, {
      status: 503,
      code: 'E_PLATFORM_AI_MISSING_API_KEY',
    })
  }

  static embeddingProviderMismatch() {
    return new this('embeddingProvider must match chatProvider', {
      status: 422,
      code: 'E_PLATFORM_AI_EMBEDDING_PROVIDER_MISMATCH',
    })
  }

  static invalidModel(field: string, model: string, provider: string) {
    return new this(`${field} "${model}" is not allowed for provider "${provider}"`, {
      status: 422,
      code: 'E_PLATFORM_AI_INVALID_MODEL',
    })
  }

  chunkCount?: number

  static reindexRequired(chunkCount: number) {
    const error = new this(
      `${chunkCount} knowledge chunks exist in the active embedding space. Confirm reindex to continue.`,
      {
        status: 409,
        code: 'E_PLATFORM_AI_REINDEX_REQUIRED',
      }
    )
    error.chunkCount = chunkCount
    return error
  }

  static reindexInProgress() {
    return new this(
      'A knowledge reindex is already running. Wait for it to finish before changing provider or embedding model.',
      {
        status: 409,
        code: 'E_PLATFORM_AI_REINDEX_IN_PROGRESS',
      }
    )
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
      ...(typeof error.chunkCount === 'number' ? { chunkCount: error.chunkCount } : {}),
    })
  }

  report(error: this, { logger }: HttpContext) {
    logger.warn({ code: error.code }, error.message)
  }
}
