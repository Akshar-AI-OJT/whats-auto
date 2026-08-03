import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { WhatsappWebhookService } from '#services/whatsapp_webhook_service'
import type { MetaWebhookPayload } from '#lib/meta_whatsapp/types'

/**
 * Public Meta Cloud API webhook (platform-level — no jwtAuth / tenant).
 * Path: GET|POST /api/v1/webhooks/whatsapp
 */
export default class WhatsappWebhookController {
  /**
   * @verify
   * @summary Meta webhook subscription verification
   * @description Echoes hub.challenge when hub.verify_token matches platform WHATSAPP_VERIFY_TOKEN.
   * @tag Webhooks
   * @responseBody 200 - plain challenge string
   * @responseBody 403 - { "error": "Invalid WhatsApp webhook verify token", "code": "E_WA_WEBHOOK_VERIFY_TOKEN" }
   */
  @inject()
  async verify({ request, response }: HttpContext, webhookService: WhatsappWebhookService) {
    const challenge = webhookService.verifyChallenge({
      mode: request.input('hub.mode'),
      verifyToken: request.input('hub.verify_token'),
      challenge: request.input('hub.challenge'),
    })

    return response.status(200).type('text/plain').send(challenge)
  }

  /**
   * @receive
   * @summary Meta webhook event receiver
   * @description Verifies X-Hub-Signature-256, ingests inbox/CRM data, acknowledges.
   * @tag Webhooks
   * @responseBody 200 - { "success": true }
   * @responseBody 403 - { "error": "Invalid WhatsApp webhook signature", "code": "E_WA_WEBHOOK_SIGNATURE" }
   */
  @inject()
  async receive({ request, response }: HttpContext, webhookService: WhatsappWebhookService) {
    await webhookService.handleInbound({
      rawBody: request.raw(),
      signatureHeader: request.header('x-hub-signature-256'),
      payload: request.body() as MetaWebhookPayload,
    })

    return response.ok({ success: true })
  }
}
