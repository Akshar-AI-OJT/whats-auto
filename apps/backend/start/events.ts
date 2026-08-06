/**
 * Event → listener registrations.
 * Listeners for Automation/SSE attach here; failures are logged only and must
 * never retry sends, reverse durable message state, or throw into emitters.
 */
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'
import InboxMessageFailed from '#events/inbox_message_failed'
import InboxMessageQueued from '#events/inbox_message_queued'
import InboxMessageReceived from '#events/inbox_message_received'
import InboxMessageSent from '#events/inbox_message_sent'
import InboxStatusUpdated from '#events/inbox_status_updated'

function logListenerFailure(
  eventName: string,
  payload: Record<string, unknown>,
  error: unknown
) {
  logger.error(
    {
      ...payload,
      err: error instanceof Error ? error.message : 'unknown',
    },
    eventName
  )
}

emitter.on(InboxMessageQueued, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.queued')
  } catch (error) {
    logListenerFailure('inbox.message.queued_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageSent, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.sent')
  } catch (error) {
    logListenerFailure('inbox.message.sent_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageFailed, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.failed')
  } catch (error) {
    logListenerFailure('inbox.message.failed_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageReceived, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.received')
  } catch (error) {
    logListenerFailure('inbox.message.received_listener_failed', event.payload, error)
  }
})

emitter.on(InboxStatusUpdated, (event) => {
  try {
    logger.info(event.payload, 'inbox.status.updated')
  } catch (error) {
    logListenerFailure('inbox.status.updated_listener_failed', event.payload, error)
  }
})
