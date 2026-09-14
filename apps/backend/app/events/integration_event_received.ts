import { BaseEvent } from '@adonisjs/core/events'
import type { IntegrationEventReceivedPayload } from '#lib/integrations/event_contract'

/**
 * Emitted after a newly inserted integration_events ledger row commits.
 * DeterministicCommerceNotifier sends WhatsApp; ingress must not.
 */
export default class IntegrationEventReceived extends BaseEvent {
  constructor(public payload: IntegrationEventReceivedPayload) {
    super()
  }
}
