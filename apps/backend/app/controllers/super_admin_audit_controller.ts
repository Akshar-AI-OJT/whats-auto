import type { HttpContext } from '@adonisjs/core/http'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { AuditService } from '#services/audit_service'
import { listPlatformAuditValidator } from '#validators/organization'
import '#types/http'

export default class SuperAdminAuditController {
  /**
   * @summary List platform audit events (Super Admin)
   * @description Org-lifecycle, billing, plan, and AI config events. Requires platform:audit_view. Filters apply before limit. Optional organizationId filters to one tenant without exposing tenant RBAC events.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery search - Case-insensitive match on event, reason, target, actor, and organization - @type(string)
   * @paramQuery eventType - Platform catalog event type - @type(string)
   * @paramQuery actorUserId - Actor user id - @type(string)
   * @paramQuery targetType - Entity / target type - @type(string)
   * @paramQuery dateFrom - Inclusive start on createdAt - @type(string)
   * @paramQuery dateTo - Inclusive end on createdAt - @type(string)
   * @paramQuery limit - Max events to return (1-100, default 50) - @type(number)
   * @paramQuery organizationId - Filter to one organization - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "eventType": "organization.created" }] }
   * @responseBody 403 - { "error": "Permission denied: platform:audit_view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewAuditLogs')

    const params = await request.validateUsing(listPlatformAuditValidator, {
      data: request.qs(),
    })

    const result = await new AuditService().listEvents({
      scope: 'platform',
      organizationId: params.organizationId ?? null,
      limit: params.limit,
      search: params.search,
      eventType: params.eventType,
      actorUserId: params.actorUserId,
      targetType: params.targetType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      includeFacets: params.includeFacets,
    })

    if (params.includeFacets) {
      return serialize.withoutWrapping({
        data: result.events,
        eventTypes: result.eventTypes ?? [],
        actors: result.actors ?? [],
        targetTypes: result.targetTypes ?? [],
      })
    }

    return serialize(result.events)
  }
}
