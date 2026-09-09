export enum AiUsageDecision {
  AUTO_REPLIED = 'AUTO_REPLIED',
  HANDOVER_LOW_CONFIDENCE = 'HANDOVER_LOW_CONFIDENCE',
  HANDOVER_KEYWORD = 'HANDOVER_KEYWORD',
  HANDOVER_ERROR = 'HANDOVER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  CONVERSATION_SUMMARY = 'CONVERSATION_SUMMARY',
  DOCUMENT_INDEX = 'DOCUMENT_INDEX',
  DOCUMENT_REINDEX = 'DOCUMENT_REINDEX',
  CACHE_HIT = 'CACHE_HIT',
}

export const AI_USAGE_DECISIONS = Object.values(AiUsageDecision)

export type AiOperationType =
  'rag_query' | 'rag_tangent' | 'conversation_summary' | 'document_index' | 'document_reindex'

export const AI_OPERATION_TYPES: AiOperationType[] = [
  'rag_query',
  'rag_tangent',
  'conversation_summary',
  'document_index',
  'document_reindex',
]
