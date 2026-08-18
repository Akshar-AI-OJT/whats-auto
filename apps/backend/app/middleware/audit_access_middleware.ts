import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { PERMISSIONS } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import TenantMiddleware from '#middleware/tenant_middleware'
import '#types/http'

/**
 * Dual-context access for GET /api/v1/audit.
 *
 * Super Admin (global platform:audit_view): no active organization required.
 * Tenant users: same as before — tenant middleware + team:view.
 */
export default class AuditAccessMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const userId = ctx.request.authUser?.id
    if (userId) {
      const platformPermissions =
        await new AuthorizationService().resolvePlatformPermissionsForUser(userId)
      if (platformPermissions.has(PERMISSIONS.PLATFORM_AUDIT_VIEW)) {
        ctx.request.memberPermissions = platformPermissions
        return next()
      }
    }

    return new TenantMiddleware().handle(ctx, async () => {
      if (!ctx.request.memberPermissions?.has(PERMISSIONS.TEAM_VIEW)) {
        return ctx.response.forbidden({
          error: `Permission denied: ${PERMISSIONS.TEAM_VIEW}`,
          code: 'PERMISSION_DENIED',
          required: PERMISSIONS.TEAM_VIEW,
          role: ctx.request.activeMember?.role,
        })
      }
      return next()
    })
  }
}
