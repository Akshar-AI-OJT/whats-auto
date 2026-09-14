import logger from '@adonisjs/core/services/logger'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import { inboxSseBus } from '#services/inbox_sse_bus'

export function publishInboxAiEvent(organizationId: string, event: InboxAiSseEvent): void {
  try {
    inboxSseBus.publish({
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
