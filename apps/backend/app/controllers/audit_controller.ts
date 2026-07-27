import type { HttpContext } from '@adonisjs/core/http'
import { AuditService } from '#services/audit_service'
import { listAuditValidator } from '#validators/organization'
import '#types/http'

export default class AuditController {
  /**
   * @summary List authorization audit events for the active organization
   * @description Newest first. Optional limit query (1–100, default 50).
   * @tag Audit
   * @security BearerAuth
   * @paramQuery limit - Max events to return (1-100) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "actorUserId": "uuid", "targetType": "role", "targetId": null, "eventType": "role.created", "before": null, "after": {}, "reason": null, "createdAt": "2026-07-21T12:00:00.000Z" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: team:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const { limit } = await request.validateUsing(listAuditValidator, {
      data: request.qs(),
    })

    const events = await new AuditService().listEvents(request.activeMember!.organizationId, {
      limit,
    })
    return serialize(events)
  }
}
