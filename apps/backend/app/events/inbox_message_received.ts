import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted after a newly persisted inbound inbox message commits.
 * Payload uses stable IDs so Automation/SSE listeners stay queue-friendly.
 */
export default class InboxMessageReceived extends BaseEvent {
  constructor(
    public payload: {
      organizationId: string
      conversationId: string
      messageId: string
      whatsappConfigId: string
      contactId: string
      contentType: string
      providerMessageId: string
      occurredAt: string
    }
  ) {
    super()
  }
}
