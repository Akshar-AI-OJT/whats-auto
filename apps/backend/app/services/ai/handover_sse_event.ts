import { AiUsageDecision } from '#enums/ai_usage_decision'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'

export type HandoverSseSource = {
  conversationId: string
  reason: string
  usage?: {
    decision: AiUsageDecision
    retrievalScore?: number | null
  }
}

/**
 * Map a flow handover onto the inbox SSE contract the frontend already consumes.
 */
export function handoverSseEvent(source: HandoverSseSource): InboxAiSseEvent {
  if (source.usage?.decision === AiUsageDecision.HANDOVER_KEYWORD) {
    return {
      type: 'ai.handover.triggered',
      data: {
        conversationId: source.conversationId,
        reason: 'keyword_match',
        matchedKeyword: source.reason,
      },
    }
  }

  if (
    source.usage?.decision === AiUsageDecision.HANDOVER_LOW_CONFIDENCE ||
    source.reason === 'low_confidence'
  ) {
    const score = source.usage?.retrievalScore
    return {
      type: 'ai.handover.triggered',
      data: {
        conversationId: source.conversationId,
        reason: 'low_confidence',
        ...(score !== null ? { score } : {}),
      },
    }
  }

  return {
    type: 'ai.handover.triggered',
    data: {
      conversationId: source.conversationId,
      reason: 'business_exception',
    },
  }
}
