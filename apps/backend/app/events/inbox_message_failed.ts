import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted only after terminal outbound failure has been persisted.
 * providerMessageId is included when available (usually null on send failure).
 */
export default class InboxMessageFailed extends BaseEvent {
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
