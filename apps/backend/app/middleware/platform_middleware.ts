import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { AuthorizationService } from '#services/authorization_service'
import '#types/http'

/**
 * Resolves platform (superadmin) permissions for the authenticated user.
 * Populates request.memberPermissions for requirePermission middleware.
 * Does not require an active organization.
 */
export default class PlatformMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const permissions = await new AuthorizationService().resolvePlatformPermissionsForUser(
      request.authUser!.id
    )

    if (permissions.size === 0) {
      return response.forbidden({
        error: 'Platform access required. Super Admin role is required.',
        code: 'PLATFORM_ACCESS_DENIED',
      })
    }

    request.memberPermissions = permissions
    return next()
  }
}
