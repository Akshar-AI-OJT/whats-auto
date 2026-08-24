/**
 * Event → listener registrations.
 * Listeners for Automation/SSE attach here; failures are logged only and must
 * never retry sends, reverse durable message state, or throw into emitters.
 */
import app from '@adonisjs/core/services/app'
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'
import AiDebounceService from '#services/ai/ai_debounce_service'
import FlowRouterService from '#services/flow/flow_router_service'
import { enqueueFlowAdvanceSession } from '#services/flow/enqueue_flow_advance'
import InboxMessageFailed from '#events/inbox_message_failed'
import InboxMessageQueued from '#events/inbox_message_queued'
import InboxMessageReceived from '#events/inbox_message_received'
import InboxMessageSent from '#events/inbox_message_sent'
import InboxStatusUpdated from '#events/inbox_status_updated'
import IntegrationEventReceived from '#events/integration_event_received'
import { inboxSseBus } from '#services/inbox_sse_bus'
import { DeterministicCommerceNotifier } from '#services/integrations/deterministic_commerce_notifier'

function logListenerFailure(eventName: string, payload: Record<string, unknown>, error: unknown) {
  logger.error(
    {
      ...payload,
      err: error instanceof Error ? error.message : 'unknown',
    },
    eventName
  )
}

function publishSafely(
  type:
    'message.received' | 'message.queued' | 'message.sent' | 'message.failed' | 'status.updated',
  organizationId: string,
  payload: Record<string, unknown>
) {
  try {
    inboxSseBus.publish({ type, organizationId, payload })
  } catch (error) {
    logListenerFailure(`inbox.${type}_sse_failed`, payload, error)
  }
}

emitter.on(InboxMessageQueued, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.queued')
    publishSafely('message.queued', event.payload.organizationId, event.payload)
  } catch (error) {
    logListenerFailure('inbox.message.queued_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageSent, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.sent')
    publishSafely('message.sent', event.payload.organizationId, event.payload)
  } catch (error) {
    logListenerFailure('inbox.message.sent_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageFailed, (event) => {
  try {
    logger.info(event.payload, 'inbox.message.failed')
    publishSafely('message.failed', event.payload.organizationId, event.payload)
  } catch (error) {
    logListenerFailure('inbox.message.failed_listener_failed', event.payload, error)
  }
})

emitter.on(InboxMessageReceived, async (event) => {
  try {
    logger.info(event.payload, 'inbox.message.received')
    publishSafely('message.received', event.payload.organizationId, event.payload)

    const router = new FlowRouterService()
    const decision = await router.decide({
      organizationId: event.payload.organizationId,
      conversationId: event.payload.conversationId,
      contactId: event.payload.contactId,
      messageId: event.payload.messageId,
      contentText: event.payload.contentText,
      interactiveReplyId: event.payload.interactiveReplyId,
    })

    const debounce = await app.container.make(AiDebounceService)

    if (decision.kind === 'flow') {
      // Fully suppress AI debounce while a flow session owns the conversation.
      await debounce.cancelPending(event.payload.organizationId, event.payload.conversationId)
      await enqueueFlowAdvanceSession(decision.payload)
      return
    }

    await debounce.scheduleFromInbound({
      organizationId: event.payload.organizationId,
      conversationId: event.payload.conversationId,
      contactId: event.payload.contactId,
      messageId: event.payload.messageId,
      contentText: event.payload.contentText,
    })
  } catch (error) {
    logListenerFailure('inbox.message.received_listener_failed', event.payload, error)
  }
})

emitter.on(InboxStatusUpdated, (event) => {
  try {
    logger.info(event.payload, 'inbox.status.updated')
    publishSafely('status.updated', event.payload.organizationId, event.payload)
  } catch (error) {
    logListenerFailure('inbox.status.updated_listener_failed', event.payload, error)
  }
})

emitter.on(IntegrationEventReceived, async (event) => {
  try {
    const notifier = new DeterministicCommerceNotifier()
    await notifier.handle(event.payload)
  } catch (error) {
    logListenerFailure(
      'integration.event.received_listener_failed',
      {
        integrationEventId: event.payload.integrationEventId,
        organizationId: event.payload.organizationId,
      },
      error
    )
  }
})
