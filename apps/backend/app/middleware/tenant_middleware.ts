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
        error: 'No active organization. Call /api/auth/organization/set-active first.',
        code: 'NO_ACTIVE_ORG',
      })
    }

    // Verify membership and get role (org tables are not RLS-scoped)
    const member = await db
      .from('organization_members')
      .where('organizationId', orgId)
      .where('userId', request.authUser!.id)
      .select('id', 'role', 'organizationId', 'userId')
      .first()

    if (!member) {
      return response.forbidden({
        error: 'You are not a member of this organization.',
        code: 'NOT_A_MEMBER',
      })
    }

    request.activeMember = member

    const authz = new AuthorizationService()
    request.memberPermissions = await authz.resolvePermissions(orgId, member.role)

    // Bind org to ALS for the rest of the request. TenantRlsProvider stamps
    // app.current_organization_id on every connection acquire from this context.
    return runWithTenant(orgId, () => next())
  }
}
