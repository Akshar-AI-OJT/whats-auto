import type { HttpContext } from '@adonisjs/core/http'
import AuditPolicy from '#policies/audit_policy'
import { AuditService } from '#services/audit_service'
import { listTenantAuditValidator } from '#validators/organization'
import '#types/http'

export default class AuditController {
  /**
   * @index
   * @summary List tenant authorization audit events
   * @description Active-organization scoped. Requires audit:view. Newest first. Filters apply before limit. Client organizationId is ignored.
   * @tag Audit
   * @security BearerAuth
   * @paramQuery search - Case-insensitive match on event, reason, target, and actor - @type(string)
   * @paramQuery eventType - Tenant catalog event type - @type(string)
   * @paramQuery actorUserId - Actor user id - @type(string)
   * @paramQuery targetType - Entity / target type - @type(string)
   * @paramQuery dateFrom - Inclusive start on createdAt - @type(string)
   * @paramQuery dateTo - Inclusive end on createdAt - @type(string)
   * @paramQuery limit - Max events to return (1-100, default 50) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "organizationId": "uuid", "eventType": "role.created" }] }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: audit:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    const params = await request.validateUsing(listTenantAuditValidator, {
      data: request.qs(),
    })

    const organizationId = request.activeMember!.organizationId
    await bouncer.with(AuditPolicy).authorize('view', organizationId)

    const result = await new AuditService().listEvents({
      scope: 'tenant',
      organizationId,
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
