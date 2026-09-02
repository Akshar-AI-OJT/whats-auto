import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { extractPostgresError, extractUniqueViolationField } from '#lib/pg_unique_violation'

function isBouncerForbidden(
  error: unknown
): error is { status: number; code: string; message?: string } {
  if (!error || typeof error !== 'object') {
    return false
  }
  const candidate = error as { status?: unknown; code?: unknown }
  return candidate.code === 'E_AUTHORIZATION_FAILURE' && candidate.status === 403
}

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    // Defense-in-depth: never leak raw Postgres unique_violation SQL to clients.
    // Domain services should map known constraints to typed exceptions first;
    // this catches any unmapped 23505 across the API surface.
    const pgError = extractPostgresError(error)
    if (pgError?.code === '23505') {
      const field = extractUniqueViolationField(pgError.detail) || 'field'
      return ctx.response.status(409).send({
        error: `A record with this ${field} already exists.`,
        code: 'E_DUPLICATE_RESOURCE',
        field,
      })
    }

    // Bouncer authorize() throws E_AUTHORIZATION_FAILURE. Map 403s onto the documented
    // API contract used by Swagger (`PERMISSION_DENIED`).
    // Preserve non-403 AuthorizationResponse.deny statuses (404/422) for super.handle.
    if (isBouncerForbidden(error)) {
      return ctx.response.status(403).send({
        error: error.message || 'Permission denied',
        code: 'PERMISSION_DENIED',
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
