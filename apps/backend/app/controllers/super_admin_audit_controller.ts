import type { HttpContext } from '@adonisjs/core/http'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { AuditService } from '#services/audit_service'
import { listPlatformAuditValidator } from '#validators/organization'
import '#types/http'

export default class SuperAdminAuditController {
  /**
   * @summary List platform audit events (Super Admin)
   * @description Org-lifecycle, billing, plan, and AI config events. Requires platform:audit_view. Optional organizationId filters to one tenant without exposing tenant RBAC events.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery limit - Max events to return (1-100) - @type(number)
   * @paramQuery organizationId - Filter to one organization - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "eventType": "organization.created" }] }
   * @responseBody 403 - { "error": "Permission denied: platform:audit_view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewAuditLogs')

    const { limit, organizationId } = await request.validateUsing(listPlatformAuditValidator, {
      data: request.qs(),
    })

    const events = await new AuditService().listEvents({
      scope: 'platform',
      organizationId: organizationId ?? null,
      limit,
    })
    return serialize(events)
  }
}
