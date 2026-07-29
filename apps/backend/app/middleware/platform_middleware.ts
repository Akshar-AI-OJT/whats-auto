import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { PLATFORM_PERMISSIONS, type Permission } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import { permissionsFromClaims } from '#lib/access_token_permissions'
import '#types/http'

/**
 * Resolves platform (superadmin) permissions for the authenticated user.
 * Populates request.memberPermissions for requirePermission middleware.
 * Does not require an active organization.
 */
export default class PlatformMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (request.authMethod === 'bearer' && request.accessTokenClaims) {
      let permissions: Set<Permission>
      try {
        permissions = permissionsFromClaims(request.accessTokenClaims)
      } catch {
        return response.unauthorized({
          error: 'Access token contains unknown permission scopes',
          code: 'UNKNOWN_SCOPE',
        })
      }

      // Only platform scopes authorize this middleware.
      const platformPerms =
        request.accessTokenClaims.role === 'superadmin'
          ? new Set(PLATFORM_PERMISSIONS)
          : new Set([...permissions].filter((p) => p.startsWith('platform:')))

      if (platformPerms.size === 0) {
        return response.forbidden({
          error: 'Platform access required. Super Admin role is required.',
          code: 'PLATFORM_ACCESS_DENIED',
        })
      }

      request.memberPermissions = platformPerms
      return next()
    }

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
