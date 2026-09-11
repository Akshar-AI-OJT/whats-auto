import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class PlatformCatalogException extends Exception {
  static templateNotFound() {
    return new this('Template catalog item not found', {
      status: 404,
      code: 'E_TEMPLATE_CATALOG_NOT_FOUND',
    })
  }

  static flowNotFound() {
    return new this('Flow catalog item not found', {
      status: 404,
      code: 'E_FLOW_CATALOG_NOT_FOUND',
    })
  }

  static libraryTokenMissing() {
    return new this('Meta Template Library is not configured. Set META_SYSTEM_USER_ACCESS_TOKEN.', {
      status: 503,
      code: 'E_TEMPLATE_LIBRARY_TOKEN_MISSING',
    })
  }

  static duplicateSlug(slug: string) {
    return new this(`Catalog slug "${slug}" already exists`, {
      status: 409,
      code: 'E_CATALOG_SLUG_DUPLICATE',
    })
  }

  static invalidGraph(errors: unknown[]) {
    const err = new this('Catalog flow graph is invalid', {
      status: 422,
      code: 'E_FLOW_CATALOG_INVALID',
    })
    ;(err as this & { graphErrors: unknown[] }).graphErrors = errors
    return err
  }

  static archived() {
    return new this('Catalog item is archived', {
      status: 422,
      code: 'E_CATALOG_ARCHIVED',
    })
  }

  static incomplete() {
    return new this('Catalog template is incomplete and cannot be published', {
      status: 422,
      code: 'E_CATALOG_INCOMPLETE',
    })
  }

  static subflowCycle() {
    return new this('Catalog flow subflow references form a cycle', {
      status: 422,
      code: 'E_FLOW_CATALOG_SUBFLOW_CYCLE',
    })
  }

  handle(error: this, { response }: HttpContext) {
    const extra =
      error.code === 'E_FLOW_CATALOG_INVALID' && 'graphErrors' in error
        ? { errors: (error as this & { graphErrors: unknown[] }).graphErrors }
        : {}
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
      ...extra,
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
