import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { updatePlatformAiConfigValidator } from '#validators/platform_ai_config'
import '#types/http'

export default class SuperAdminAiConfigController {
  /**
   * @show
   * @summary Get platform AI config (Super Admin)
   * @description Singleton engine knobs. Requires Super Admin role and platform:config_view. Does not include API keys or knowledge-chunk counts. Includes reindexStatus when a knowledge reindex is running or failed.
   * @tag Super-Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "isEnabled": true, "chatProvider": "openai", "chatModel": "gpt-4o-mini", "summaryModel": null, "embeddingModel": "text-embedding-3-small" } }
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
   * @description Partial update of the singleton row. Requires Super Admin role and platform:config_manage. API keys are not accepted. Models must be in the provider allowlist. embeddingProvider must match chatProvider. Changing provider or embedding model while knowledge chunks exist in the active space returns 409 unless confirmReindex is true, which enqueues AI_REINDEX_ALL_DOCUMENTS and flips the live space only after the job finishes.
   * @tag Super-Admin
   * @security BearerAuth
   * @requestBody { "chatProvider": "openai", "chatModel": "gpt-4o-mini", "summaryModel": null, "embeddingModel": "text-embedding-3-small", "confirmReindex": false }
   * @responseBody 200 - { "data": { "isEnabled": true, "chatProvider": "openai", "chatModel": "gpt-4o-mini", "reindexStatus": "idle" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:config_manage", "code": "PERMISSION_DENIED" }
   * @responseBody 409 - { "error": "N knowledge chunks exist in the active embedding space.", "code": "E_PLATFORM_AI_REINDEX_REQUIRED", "chunkCount": 4 }
   * @responseBody 422 - { "error": "chatModel is not allowed for provider openai", "code": "E_PLATFORM_AI_INVALID_MODEL" }
   */
  @inject()
  async update({ request, serialize }: HttpContext, platformAiConfig: PlatformAiConfigService) {
    const payload = await request.validateUsing(updatePlatformAiConfigValidator)
    const config = await platformAiConfig.update(payload, request.authUser!.id)
    return serialize(config)
  }
}
