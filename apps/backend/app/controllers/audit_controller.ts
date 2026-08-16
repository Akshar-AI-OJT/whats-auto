import type { HttpContext } from '@adonisjs/core/http'
import AuditPolicy from '#policies/audit_policy'
import { PERMISSIONS } from '#abilities/permissions'
import { AuditService } from '#services/audit_service'
import { listAuditValidator } from '#validators/organization'
import '#types/http'

export default class AuditController {
  /**
   * @index
   * @summary List authorization audit events
   * @description Super Admin (platform:audit_view) receives platform-wide events without an active organization; optional organizationId query filters to one tenant. Tenant users receive the active organization's events (team:view). Newest first. Optional limit query (1–100, default 50).
   * @tag Audit
   * @security BearerAuth
   * @paramQuery limit - Max events to return (1-100) - @type(number)
   * @paramQuery organizationId - Super Admin only: filter to one organization - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "organizationId": "uuid", "organizationName": "Acme", "actorUserId": "uuid", "actorName": "Ada", "targetType": "role", "targetId": "uuid", "eventType": "role.created", "granted": true, "before": {}, "after": {}, "reason": "Narrow agent inbox access", "createdAt": "2026-07-21T12:00:00.000Z" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: team:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    const { limit, organizationId } = await request.validateUsing(listAuditValidator, {
      data: request.qs(),
    })

    await bouncer.with(AuditPolicy).authorize('view', organizationId)

    const isPlatformAuditor = Boolean(
      request.memberPermissions?.has(PERMISSIONS.PLATFORM_AUDIT_VIEW)
    )

    const events = await new AuditService().listEvents({
      organizationId: isPlatformAuditor
        ? (organizationId ?? null)
        : request.activeMember!.organizationId,
      limit,
    })
    return serialize(events)
  }
}
