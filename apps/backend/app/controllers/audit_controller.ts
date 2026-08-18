import type { HttpContext } from '@adonisjs/core/http'
import AuditPolicy from '#policies/audit_policy'
import { AuditService } from '#services/audit_service'
import { listTenantAuditValidator } from '#validators/organization'
import '#types/http'

export default class AuditController {
  /**
   * @index
   * @summary List tenant authorization audit events
   * @description Active-organization scoped. Requires audit:view. Newest first. Optional limit query (1–100, default 50). Client organizationId is ignored.
   * @tag Audit
   * @security BearerAuth
   * @paramQuery limit - Max events to return (1-100) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "organizationId": "uuid", "eventType": "role.created" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: audit:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    const { limit } = await request.validateUsing(listTenantAuditValidator, {
      data: request.qs(),
    })

    const organizationId = request.activeMember!.organizationId
    await bouncer.with(AuditPolicy).authorize('view', organizationId)

    const events = await new AuditService().listEvents({
      scope: 'tenant',
      organizationId,
      limit,
    })
    return serialize(events)
  }
}
