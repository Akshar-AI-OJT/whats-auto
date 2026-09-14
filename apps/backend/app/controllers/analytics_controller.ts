import type { HttpContext } from '@adonisjs/core/http'
import AnalyticsPolicy from '#policies/analytics_policy'
import { AnalyticsService } from '#services/analytics_service'
import '#types/http'

export default class AnalyticsController {
  /**
   * @summary Tenant analytics KPI summary
   * @description SQL aggregates for Organization Analytics. Always scoped to the active organization. Client organizationId is ignored. Requires analytics:view.
   * @tag Analytics
   * @security BearerAuth
   * @responseBody 200 - { "data": { "totalContacts": 0, "totalCampaigns": 0, "sentCount": 0 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: analytics:view", "code": "PERMISSION_DENIED" }
   */
  async summary({ bouncer, request, serialize }: HttpContext) {
    const organizationId = request.activeMember!.organizationId
    await bouncer.with(AnalyticsPolicy).authorize('view', organizationId)

    const summary = await new AnalyticsService().getTenantSummary(organizationId)
    return serialize(summary)
  }
}
