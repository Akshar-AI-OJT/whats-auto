import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import {
  BillingRazorpayWebhookService,
  type RazorpayWebhookBody,
} from '#services/billing/billing_razorpay_webhook_service'

/**
 * Public platform Razorpay SaaS billing webhook (no jwtAuth / tenant).
 * Path: POST /api/v1/webhooks/billing/razorpay
 */
export default class BillingRazorpayWebhookController {
  /**
   * @summary Razorpay platform billing webhook
   * @description Verifies X-Razorpay-Signature, persists payment_webhook_events, enqueues async mutation.
   * @tag Webhooks
   * @responseBody 200 - { "success": true }
   * @responseBody 403 - { "error": "Invalid Razorpay billing webhook signature", "code": "E_BILLING_WEBHOOK_SIGNATURE" }
   */
  @inject()
  async receive({ request, response }: HttpContext, webhookService: BillingRazorpayWebhookService) {
    await webhookService.handleInbound({
      rawBody: request.raw(),
      signatureHeader: request.header('x-razorpay-signature'),
      eventIdHeader: request.header('x-razorpay-event-id'),
      body: request.body() as RazorpayWebhookBody,
    })

    return response.ok({ success: true })
  }
}
