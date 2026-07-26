import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { AuthorizationService } from '#services/authorization_service'
import { runWithTenant } from '#services/tenant_context'
import '#types/http'

export default class TenantMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const orgId = request.activeOrganizationId

    if (!orgId) {
      return response.forbidden({
        error: 'No active organization. Call POST /api/v1/organizations/:id/set-active first.',
        code: 'NO_ACTIVE_ORG',
      })
    }

    // Verify membership and get role (org tables are not RLS-scoped)
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
