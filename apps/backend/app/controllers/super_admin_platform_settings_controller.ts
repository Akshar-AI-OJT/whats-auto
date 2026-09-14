import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import SuperAdminPolicy from '#policies/super_admin_policy'
import PlatformSettingsService from '#services/platform_settings_service'
import { updatePlatformSettingsValidator } from '#validators/platform_settings'
import '#types/http'

export default class SuperAdminPlatformSettingsController {
  /**
   * @show
   * @summary Get platform settings (Super Admin)
   * @description Singleton branding and policy settings. Requires Super Admin role and platform:config_view. SMTP/OAuth secrets are never returned.
   * @tag Super-Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "platformName": "WhatsAuto", "supportEmail": "support@example.com", "smtpPasswordConfigured": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_view", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async show({ bouncer, serialize }: HttpContext, settings: PlatformSettingsService) {
    await bouncer.with(SuperAdminPolicy).authorize('viewPlatformSettings')
    return serialize(await settings.get())
  }

  /**
   * @update
   * @summary Update platform settings (Super Admin)
   * @description Partial update of the singleton row. Requires Super Admin role and platform:config_manage. SMTP/OAuth secrets are not accepted.
   * @tag Super-Admin
   * @security BearerAuth
   * @requestBody { "platformName": "WhatsAuto", "maintenanceEnabled": false }
   * @responseBody 200 - { "data": { "platformName": "WhatsAuto", "maintenanceEnabled": false } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "errors": [{ "field": "supportEmail", "message": "The supportEmail field must be a valid email address" }] }
   */
  @inject()
  async update({ bouncer, request, serialize }: HttpContext, settings: PlatformSettingsService) {
    await bouncer.with(SuperAdminPolicy).authorize('managePlatformSettings')
    const payload = await request.validateUsing(updatePlatformSettingsValidator)
    return serialize(await settings.update(payload, request.authUser!.id))
  }
}
