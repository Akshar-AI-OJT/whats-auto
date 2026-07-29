import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_PERMISSIONS, type Permission } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import { permissionsFromClaims } from '#lib/access_token_permissions'
import { checkPlatformPermissionVersion } from '#lib/permission_version'
import '#types/http'

/**
 * Resolves platform (superadmin) permissions for the authenticated user.
 * Populates request.memberPermissions for requirePermission middleware.
 * Does not require an active organization.
 */
export default class PlatformMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (request.authMethod === 'bearer' && request.accessTokenClaims) {
      const claims = request.accessTokenClaims

      const grantRow = await db
        .from('user_roles')
        .where('userId', claims.sub)
        .whereNull('organizationId')
        .select('userId', 'permissionVersion')
        .first()

      const versionCheck = checkPlatformPermissionVersion({
        claims,
        grant: grantRow
          ? {
              userId: grantRow.userId as string,
              permissionVersion: Number(grantRow.permissionVersion),
            }
          : null,
      })

      if (!versionCheck.ok) {
        return response.unauthorized({
          error: 'Access token permissions are stale. Mint a new token.',
          code: 'TOKEN_PERMISSIONS_STALE',
          reason: versionCheck.reason,
        })
      }

      let permissions: Set<Permission>
      try {
        permissions = permissionsFromClaims(claims)
      } catch {
        return response.unauthorized({
          error: 'Access token contains unknown permission scopes',
          code: 'UNKNOWN_SCOPE',
        })
      }

      // Only platform scopes authorize this middleware.
      const platformPerms =
        claims.role === 'superadmin'
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
