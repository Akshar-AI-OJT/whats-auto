import type { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

export interface ProcessDocumentJobPayload {
  documentId: string
  organizationId: string
  mediaAssetId?: string
  sourceType: AiKnowledgeSourceType
  isUpdate: boolean
}

export interface DebounceTurnJobPayload {
  organizationId: string
  contactId: string
  conversationId: string
  aggregatedMessages: Array<{
    messageId: string
    content: string
    receivedAt: string
  }>
}

export interface SummarizeConversationJobPayload {
  organizationId: string
  conversationId: string
  triggerReason: 'turn_count_threshold' | 'inactivity_window'
}
