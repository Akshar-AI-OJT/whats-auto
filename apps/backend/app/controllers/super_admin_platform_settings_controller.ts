import type { HttpContext } from '@adonisjs/core/http'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { PlatformSettingsService } from '#services/platform_settings_service'
import '#types/http'

export default class SuperAdminPlatformSettingsController {
  /**
   * @show
   * @summary Get read-only platform settings snapshot (Super Admin)
   * @description Env-derived non-secret platform status for the Settings page. Requires platform:config_view or platform:config_manage. Editable knobs live on their own modules (e.g. AI Settings).
   * @tag Super-Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "branding": [{ "id": "branding_primaryDomain", "key": "primaryDomain", "value": "app.example.com", "state": "enabled" }], "authentication": [], "smtp": [], "oauth": [], "maintenanceMode": [], "configuration": [] } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_view", "code": "PERMISSION_DENIED" }
   */
  async show({ bouncer, serialize }: HttpContext) {
    await bouncer.with(SuperAdminPolicy).authorize('viewAiConfig')

    return serialize(new PlatformSettingsService().getSnapshot())
  }
}
