import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import type { FlowGraphValidationError } from '#lib/flow/flow_graph'

export default class FlowException extends Exception {
  graphErrors?: FlowGraphValidationError[]

  static notFound() {
    return new this('Flow not found', {
      status: 404,
      code: 'E_FLOW_NOT_FOUND',
    })
  }

  static invalidGraph(errors: FlowGraphValidationError[]) {
    const error = new this('Flow graph is invalid', {
      status: 422,
      code: 'E_FLOW_INVALID',
    })
    error.graphErrors = errors
    return error
  }

  static archived() {
    return new this('Archived flows cannot be edited or published', {
      status: 422,
      code: 'E_FLOW_ARCHIVED',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
      ...(error.graphErrors ? { errors: error.graphErrors } : {}),
    })
  }

  report(error: this, { logger }: HttpContext) {
    logger.warn({ code: error.code }, error.message)
  }
}
