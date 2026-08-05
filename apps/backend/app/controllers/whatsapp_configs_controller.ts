import type { HttpContext } from '@adonisjs/core/http'
import { WhatsappConfigService } from '#services/whatsapp_config_service'
import { testWhatsappConfigValidator } from '#validators/whatsapp_embedded_signup'
import '#types/http'

export default class WhatsappConfigsController {
  /**
   * @index
   * @summary List WhatsApp configs for the active organization
   * @description Never returns accessToken. Scoped to active org (app filter + RLS).
   * @tag WhatsApp
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "phoneNumberId": "456", "status": "connected" }] }
   */
  async index({ request, serialize }: HttpContext) {
    const configs = await new WhatsappConfigService().listConfigs(
      request.activeMember!.organizationId
    )
    return serialize(configs)
  }

  /**
   * @show
   * @summary Get one WhatsApp config
   * @tag WhatsApp
   * @security BearerAuth
   * @paramPath id - Config id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "phoneNumberId": "456", "status": "connected" } }
   * @responseBody 404 - { "error": "WhatsApp config not found", "code": "E_WA_CONFIG_NOT_FOUND" }
   */
  async show({ params, request, serialize }: HttpContext) {
    const config = await new WhatsappConfigService().getConfig(
      params.id,
      request.activeMember!.organizationId
    )
    return serialize(config)
  }

  /**
   * @destroy
   * @summary Disconnect a WhatsApp config
   * @description Sets status=disconnected. Encrypted token is retained for a future reconnect path.
   * @tag WhatsApp
   * @security BearerAuth
   * @paramPath id - Config id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "disconnected" } }
   */
  async destroy({ params, request, serialize }: HttpContext) {
    const config = await new WhatsappConfigService().disconnect(
      params.id,
      request.activeMember!.organizationId
    )
    return serialize(config)
  }

  /**
   * @test
   * @summary Send a smoke-test template message
   * @description Uses the config's encrypted token. Defaults to hello_world / en_US.
   * @tag WhatsApp
   * @security BearerAuth
   * @paramPath id - Config id - @type(string)
   * @requestBody { "to": "15551234567", "templateName": "hello_world", "languageCode": "en_US" }
   * @responseBody 200 - { "data": { "messageId": "wamid.xxx" } }
   * @responseBody 422 - { "error": "WhatsApp config is not connected", "code": "E_WA_NOT_CONNECTED" }
   */
  async test({ params, request, serialize }: HttpContext) {
    const payload = await request.validateUsing(testWhatsappConfigValidator)
    const result = await new WhatsappConfigService().sendTestTemplate({
      configId: params.id,
      organizationId: request.activeMember!.organizationId,
      to: payload.to,
      templateName: payload.templateName,
      languageCode: payload.languageCode,
    })
    return serialize(result)
  }
}
