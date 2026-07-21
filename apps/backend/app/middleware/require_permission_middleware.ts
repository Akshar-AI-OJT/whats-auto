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
    if (!request.memberPermissions?.has(options.permission)) {
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
