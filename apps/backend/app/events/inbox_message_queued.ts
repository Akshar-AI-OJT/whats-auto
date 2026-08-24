import { BaseEvent } from '@adonisjs/core/events'
import type { InboxOutboundLifecyclePayload } from '#types/inbox_outbound_lifecycle'

/**
 * Emitted after an outbound inbox message + dispatch have been queued and the
 * creating transaction has committed. providerMessageId is null until Meta send.
 */
export default class InboxMessageQueued extends BaseEvent {
  constructor(public payload: InboxOutboundLifecyclePayload) {
    super()
  }
}
