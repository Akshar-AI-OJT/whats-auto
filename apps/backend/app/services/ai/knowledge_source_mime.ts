import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

export const KNOWLEDGE_FILE_SOURCE_TYPES = [
  AiKnowledgeSourceType.FILE_PDF,
  AiKnowledgeSourceType.FILE_DOCX,
] as const

export const KNOWLEDGE_CREATE_SOURCE_TYPES = [
  AiKnowledgeSourceType.FILE_PDF,
  AiKnowledgeSourceType.FILE_DOCX,
  AiKnowledgeSourceType.MANUAL_TEXT,
] as const

export function mimeTypeForKnowledgeSource(sourceType: AiKnowledgeSourceType): string | null {
  switch (sourceType) {
    case AiKnowledgeSourceType.FILE_PDF:
      return 'application/pdf'
    case AiKnowledgeSourceType.FILE_DOCX:
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case AiKnowledgeSourceType.MANUAL_TEXT:
      return 'text/plain'
    default:
      return null
  }
}
