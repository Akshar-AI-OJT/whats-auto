export enum AiKnowledgeDocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  INDEXED = 'INDEXED',
  FAILED = 'FAILED',
}

export const AI_KNOWLEDGE_DOCUMENT_STATUSES = Object.values(AiKnowledgeDocumentStatus)
