import type { HttpContext } from '@adonisjs/core/http'
import { ExternalEventService } from '#services/integrations/external_event_service'
import { genericIntegrationEventValidator } from '#validators/integration_event'
import '#types/http'

export default class ExternalEventsController {
  /**
   * @store
   * @summary Accept a generic CRM integration event
   * @description Public API-key ingress. Idempotent on (organization, provider, externalEventId).
   * @tag Integrations
   * @requestBody { "externalEventId": "crm_1", "type": "crm.contact_upserted", "occurredAt": "2026-08-17T12:00:00.000Z", "payload": { "phone": "+919999999999" } }
   * @responseBody 200 - { "data": { "status": "accepted", "eventId": "uuid" } }
   * @responseBody 401 - { "error": "Invalid or expired API key", "code": "E_API_KEY_INVALID" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(genericIntegrationEventValidator)
    const result = await new ExternalEventService().acceptGeneric({
      organizationId: request.activeOrganizationId!,
      apiKeyId: request.apiKeyId!,
      externalEventId: payload.externalEventId,
      type: payload.type,
      occurredAt: payload.occurredAt,
      payload: payload.payload,
    })
    return serialize({ status: result.status, eventId: result.eventId })
  }
}
