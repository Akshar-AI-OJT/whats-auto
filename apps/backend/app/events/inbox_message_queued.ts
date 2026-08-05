import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted after an outbound inbox message + dispatch have been queued and the
 * creating transaction has committed. providerMessageId is null until Meta send.
 */
export default class InboxMessageQueued extends BaseEvent {
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
