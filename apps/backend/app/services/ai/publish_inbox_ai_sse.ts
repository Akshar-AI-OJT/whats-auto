import logger from '@adonisjs/core/services/logger'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import { inboxEventsHub } from '#services/inbox_events_hub'

export function publishInboxAiEvent(organizationId: string, event: InboxAiSseEvent): void {
  try {
    inboxEventsHub.publish({
      type: event.type,
      organizationId,
      payload: event.data,
    })
  } catch (error) {
    logger.warn(
      {
        organizationId,
        type: event.type,
        err: error instanceof Error ? error.message : 'unknown',
      },
      'inbox.ai_sse_failed'
    )
  }
}
