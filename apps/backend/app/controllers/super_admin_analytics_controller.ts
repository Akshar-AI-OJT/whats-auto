import type { HttpContext } from '@adonisjs/core/http'
import { accessPlatform } from '#abilities/main'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { AnalyticsService } from '#services/analytics_service'
import '#types/http'

export default class SuperAdminAnalyticsController {
  /**
   * @summary Platform analytics KPI summary
   * @description SQL aggregates for Super Admin Analytics. Requires platform:tenants_view. Organization filters are not accepted — totals are platform-wide.
   * @tag Super Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "totalOrganizations": 0, "activeOrganizations": 0, "trialOrganizations": 0 } }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_view", "code": "PERMISSION_DENIED" }
   */
  async summary({ bouncer, serialize }: HttpContext) {
    await bouncer.authorize(accessPlatform)
    await bouncer.with(SuperAdminPolicy).authorize('viewTenants')

    const summary = await new AnalyticsService().getPlatformSummary()
    return serialize(summary)
  }
}
