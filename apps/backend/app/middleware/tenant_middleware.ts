import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { AuthorizationService } from '#services/authorization_service'
import { permissionsFromClaims } from '#lib/access_token_permissions'
import { runWithTenant } from '#services/tenant_context'
import '#types/http'

export default class TenantMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    // Bearer path — hydrate membership + permissions from verified claims (no RBAC queries).
    if (request.authMethod === 'bearer' && request.accessTokenClaims) {
      const claims = request.accessTokenClaims

      if (!claims.org_id || !claims.member_id || !claims.role_id || !claims.role) {
        return response.forbidden({
          error: 'No active organization. Call POST /api/v1/organizations/:id/set-active first.',
          code: 'NO_ACTIVE_ORG',
        })
      }

      request.activeOrganizationId = claims.org_id
      request.activeMember = {
        id: claims.member_id,
        organizationId: claims.org_id,
        userId: claims.sub,
        roleId: claims.role_id,
        role: claims.role,
      }

      try {
        request.memberPermissions = permissionsFromClaims(claims)
      } catch {
        return response.unauthorized({
          error: 'Access token contains unknown permission scopes',
          code: 'UNKNOWN_SCOPE',
        })
      }

      return runWithTenant(claims.org_id, () => next())
    }

    // Cookie / session path — membership + permissions from DB.
    const orgId = request.activeOrganizationId

    if (!orgId) {
      return response.forbidden({
        error: 'No active organization. Call POST /api/v1/organizations/:id/set-active first.',
        code: 'NO_ACTIVE_ORG',
      })
    }

    const member = await db
      .from('organization_members as m')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.organizationId', orgId)
      .where('m.userId', request.authUser!.id)
      .select('m.id', 'm.organizationId', 'm.userId', 'm.roleId', 'r.name as role')
      .first()

    if (!member) {
      return response.forbidden({
        error: 'You are not a member of this organization.',
        code: 'NOT_A_MEMBER',
      })
    }

    request.activeMember = {
      id: member.id as string,
      organizationId: member.organizationId as string,
      userId: member.userId as string,
      roleId: member.roleId as string,
      role: member.role as string,
    }

    const authz = new AuthorizationService()
    request.memberPermissions = await authz.resolvePermissions(orgId, member.roleId as string)

    // Bind org to ALS for the rest of the request. TenantRlsProvider stamps
    // app.current_organization_id on every connection acquire from this context.
    return runWithTenant(orgId, () => next())
  }
}
