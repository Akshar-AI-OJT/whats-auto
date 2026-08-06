import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted after markSentAndReconcile persists a successful Meta send (wamid).
 * Payload uses stable IDs so Automation/SSE listeners stay queue-friendly.
 */
export default class InboxMessageSent extends BaseEvent {
  constructor(
    public payload: {
      organizationId: string
      conversationId: string
      messageId: string
      dispatchId: string
      providerMessageId?: string | null
    }
  ) {
    super()
  }
}
