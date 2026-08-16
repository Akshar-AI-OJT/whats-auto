import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Platform plan catalog domain errors (super-admin CRUD + Razorpay sync).
 */
export default class PlanException extends Exception {
  static notFound() {
    return new this('Plan Not Found', {
      status: 404,
      code: 'E_PLAN_NOT_FOUND',
    })
  }

  static codeTaken(code: string) {
    return new this(`Plan code "${code}" is already in use`, {
      status: 409,
      code: 'E_PLAN_CODE_TAKEN',
    })
  }

  static alreadyArchived() {
    return new this('Plan is already archived', {
      status: 409,
      code: 'E_PLAN_ALREADY_ARCHIVED',
    })
  }

  static gatewayFailed(message: string) {
    return new this(message, {
      status: 502,
      code: 'E_PLAN_GATEWAY_FAILED',
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
