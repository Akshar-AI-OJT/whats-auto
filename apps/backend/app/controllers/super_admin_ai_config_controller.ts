import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { updatePlatformAiConfigValidator } from '#validators/platform_ai_config'
import '#types/http'

export default class SuperAdminAiConfigController {
  /**
   * @show
   * @summary Get platform AI config (Super Admin)
   * @description Singleton engine knobs. Requires Super Admin role and platform:config_view. Does not include API keys.
   * @tag Super-Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "isEnabled": true, "modelName": "gpt-4o-mini", "temperature": 0.2, "debounceDelaySeconds": 4 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_view", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async show({ serialize }: HttpContext, platformAiConfig: PlatformAiConfigService) {
    return serialize(await platformAiConfig.get())
  }

  /**
   * @update
   * @summary Update platform AI config (Super Admin)
   * @description Partial update of the singleton row. Requires Super Admin role and platform:config_manage. API keys are not accepted.
   * @tag Super-Admin
   * @security BearerAuth
   * @requestBody { "isEnabled": true, "debounceDelaySeconds": 5, "handoverKeywords": ["agent", "human"] }
   * @responseBody 200 - { "data": { "isEnabled": true, "debounceDelaySeconds": 5 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_manage", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "summaryTurnThreshold must be greater than or equal to workingSetSize", "code": "E_PLATFORM_AI_CONFIG_SUMMARY_THRESHOLD" }
   */
  @inject()
  async update({ request, serialize }: HttpContext, platformAiConfig: PlatformAiConfigService) {
    const payload = await request.validateUsing(updatePlatformAiConfigValidator)
    const config = await platformAiConfig.update(payload, request.authUser!.id)
    return serialize(config)
  }
}
