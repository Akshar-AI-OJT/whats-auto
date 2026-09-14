import type { InboxAiMode, InboxConversation } from '@/lib/api'
import type { InboxSseAiHandoverPayload } from '@/lib/inbox-sse'

export function normalizeInboxAiMode(value: string | null | undefined): InboxAiMode {
  if (value === 'HANDOVER' || value === 'HUMAN_ACTIVE') return value
  return 'AI_AUTO'
}

export function conversationAiMode(conversation: Pick<InboxConversation, 'aiMode'>): InboxAiMode {
  return normalizeInboxAiMode(conversation.aiMode)
}

export type HandoverBannerKind = 'keyword' | 'low_confidence' | 'error'

export function handoverBannerKind(
  reason: string | null | undefined
): HandoverBannerKind {
  if (reason === 'low_confidence') return 'low_confidence'
  if (reason === 'error' || reason === 'business_exception') return 'error'
  return 'keyword'
}

/** Map SSE handover payload to the DB-shaped `aiHandoverReason` on conversation rows. */
export function aiHandoverReasonFromSse(payload: InboxSseAiHandoverPayload): string {
  if (payload.reason === 'keyword_match') {
    return payload.matchedKeyword ?? 'keyword_match'
  }
  if (payload.reason === 'low_confidence') return 'low_confidence'
  return 'error'
}
