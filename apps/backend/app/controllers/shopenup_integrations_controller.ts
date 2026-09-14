import type { HttpContext } from '@adonisjs/core/http'
import { ExternalEventService } from '#services/integrations/external_event_service'
import { shopenupIntegrationEventValidator } from '#validators/integration_event'
import '#types/http'

export default class ShopenupIntegrationsController {
  /**
   * @store
   * @summary Accept a Medusa-native Shopenup event
   * @description Public API-key ingress. Maps eventType to the frozen commerce union. Does not send WhatsApp.
   * @tag Integrations
   * @requestBody { "eventType": "order.placed", "timestamp": "2026-08-17T12:00:00.000Z", "data": { "orderId": "ord_1", "isCod": true } }
   * @responseBody 200 - { "data": { "status": "accepted", "eventId": "uuid" } }
   * @responseBody 401 - { "error": "Invalid or expired API key", "code": "E_API_KEY_INVALID" }
   * @responseBody 422 - { "error": "Unsupported integration event type", "code": "E_INTEGRATION_EVENT_UNMAPPED" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(shopenupIntegrationEventValidator)
    const result = await new ExternalEventService().acceptShopenup({
      organizationId: request.activeOrganizationId!,
      apiKeyId: request.apiKeyId!,
      eventType: payload.eventType,
      timestamp: payload.timestamp,
      data: payload.data,
    })
    return serialize({ status: result.status, eventId: result.eventId })
  }
}
