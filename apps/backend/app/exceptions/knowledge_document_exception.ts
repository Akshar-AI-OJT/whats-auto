import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class KnowledgeDocumentException extends Exception {
  static notFound() {
    return new this('Knowledge document not found', {
      status: 404,
      code: 'E_KNOWLEDGE_DOCUMENT_NOT_FOUND',
    })
  }

  static sourceUnsupported(sourceType: string) {
    return new this(`Source type ${sourceType} is not supported yet`, {
      status: 422,
      code: 'E_KNOWLEDGE_SOURCE_UNSUPPORTED',
    })
  }

  static invalidCreate(message: string) {
    return new this(message, {
      status: 422,
      code: 'E_KNOWLEDGE_DOCUMENT_INVALID',
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
