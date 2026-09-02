import type { AiKnowledgeDocumentRow } from '#repositories/ai_knowledge_document_repository'

export type KnowledgeDocumentResponse = {
  id: string
  title: string
  sourceType: string
  status: string
  chunkCount: number
  mediaAssetId: string | null
  embeddingModel: string
  documentHash: string | null
  errorMessage: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string | null
}

export function transformKnowledgeDocument(row: AiKnowledgeDocumentRow): KnowledgeDocumentResponse {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.sourceType,
    status: row.status,
    chunkCount: row.chunkCount,
    mediaAssetId: row.mediaAssetId,
    embeddingModel: row.embeddingModel,
    documentHash: row.documentHash,
    errorMessage: row.errorMessage,
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
