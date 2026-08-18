export type InboxAiHandoverReason = 'low_confidence' | 'keyword_match' | 'business_exception'

export type InboxAiSseEvent =
  | {
      type: 'ai.generation.started'
      data: { conversationId: string; promptAt: string }
    }
  | {
      type: 'ai.token.delta'
      data: { conversationId: string; delta: string; chunkIndex: number }
    }
  | {
      type: 'ai.generation.completed'
      data: {
        conversationId: string
        fullText: string
        latencyMs: number
        usage: { promptTokens: number; completionTokens: number; totalTokens: number }
      }
    }
  | {
      type: 'ai.handover.triggered'
      data: {
        conversationId: string
        reason: InboxAiHandoverReason
        score?: number
        matchedKeyword?: string
      }
    }
