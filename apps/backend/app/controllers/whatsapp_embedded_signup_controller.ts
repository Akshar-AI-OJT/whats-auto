import type { HttpContext } from '@adonisjs/core/http'
import { WhatsappEmbeddedSignupService } from '#services/whatsapp_embedded_signup_service'
import { completeEmbeddedSignupValidator } from '#validators/whatsapp_embedded_signup'
import '#types/http'

export default class WhatsappEmbeddedSignupController {
  /**
   * @session
   * @summary Get Embedded Signup session config for the FB JS SDK
   * @description Returns public Meta appId, configId, and graphVersion. No secrets. Requires active org + whatsapp:connect.
   * @tag WhatsApp
   * @security BearerAuth
   * @responseBody 200 - { "data": { "appId": "123", "configId": "456", "graphVersion": "v25.0" } }
   * @responseBody 403 - { "error": "Permission denied: whatsapp:connect", "code": "PERMISSION_DENIED" }
   */
  async session({ serialize }: HttpContext) {
    const session = new WhatsappEmbeddedSignupService().getSession()
    return serialize(session)
  }

  /**
   * @complete
   * @summary Complete Embedded Signup after Meta FINISH
   * @description Exchanges the short-lived code, subscribes the WABA, registers the phone, and upserts whatsapp_configs. Organization comes from the active session — do not send organizationId from the client. Code TTL is ~30s.
   * @tag WhatsApp
   * @security BearerAuth
   * @requestBody { "code": "AQB...", "wabaId": "123", "phoneNumberId": "456" }
   * @responseBody 200 - { "data": { "id": "uuid", "phoneNumberId": "456", "wabaId": "123", "status": "connected" } }
   * @responseBody 409 - { "error": "This WhatsApp phone number is already connected to another organization", "code": "E_WA_PHONE_OWNED" }
   * @responseBody 422 - { "error": "...", "code": "E_WA_META_GRAPH" }
   */
  async complete({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(completeEmbeddedSignupValidator)
    const config = await new WhatsappEmbeddedSignupService().complete({
      organizationId: request.activeMember!.organizationId,
      userId: request.authUser!.id,
      input: payload,
    })
    return serialize(config)
  }
}
