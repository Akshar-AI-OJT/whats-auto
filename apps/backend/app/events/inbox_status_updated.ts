import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted after a delivery receipt actually changes message state.
 * Payload uses stable IDs so Automation/SSE listeners stay queue-friendly.
 */
export default class InboxStatusUpdated extends BaseEvent {
  constructor(
    public payload: {
      organizationId: string
      conversationId: string
      messageId: string
      providerMessageId: string
      previousStatus: string
      status: string
      providerStatusAt: string
    }
  ) {
    super()
  }
}
