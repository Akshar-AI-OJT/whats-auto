import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Permission } from '#abilities/permissions'
import '#types/http'

export default class RequirePermissionMiddleware {
  async handle(
    { request, response }: HttpContext,
    next: NextFn,
    options: { permission: Permission }
  ) {
    // Missing set means auth middleware stack was misconfigured (tenant/platform not run).
    if (!request.memberPermissions) {
      return response.forbidden({
        error: 'Permission context missing. Ensure tenant or platform middleware runs first.',
        code: 'PERMISSION_CONTEXT_MISSING',
        required: options.permission,
      })
    }

    if (!request.memberPermissions.has(options.permission)) {
      return response.forbidden({
        error: `Permission denied: ${options.permission}`,
        code: 'PERMISSION_DENIED',
        required: options.permission,
        role: request.activeMember?.role,
      })
    }
    return next()
  }
}
