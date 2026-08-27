import { BaseEvent } from '@adonisjs/core/events'
import type { InboxOutboundLifecyclePayload } from '#types/inbox_outbound_lifecycle'

/**
 * Emitted after markSentAndReconcile persists a successful Meta send (wamid).
 */
export default class InboxMessageSent extends BaseEvent {
  constructor(public payload: InboxOutboundLifecyclePayload) {
    super()
  }
}
