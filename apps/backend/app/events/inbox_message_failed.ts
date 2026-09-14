import { BaseEvent } from '@adonisjs/core/events'
import type { InboxOutboundLifecyclePayload } from '#types/inbox_outbound_lifecycle'

/**
 * Emitted only after terminal outbound failure has been persisted.
 * providerMessageId is included when available (usually null on send failure).
 */
export default class InboxMessageFailed extends BaseEvent {
  constructor(public payload: InboxOutboundLifecyclePayload) {
    super()
  }
}
