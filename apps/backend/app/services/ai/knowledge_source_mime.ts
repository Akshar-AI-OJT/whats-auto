import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

/** All knowledge sources are file uploads (PDF, DOCX, or TXT). */
export const KNOWLEDGE_CREATE_SOURCE_TYPES = [
  AiKnowledgeSourceType.FILE_PDF,
  AiKnowledgeSourceType.FILE_DOCX,
  AiKnowledgeSourceType.FILE_TXT,
] as const

export const KNOWLEDGE_FILE_SOURCE_TYPES = KNOWLEDGE_CREATE_SOURCE_TYPES

export function mimeTypeForKnowledgeSource(sourceType: AiKnowledgeSourceType): string | null {
  switch (sourceType) {
    case AiKnowledgeSourceType.FILE_PDF:
      return 'application/pdf'
    case AiKnowledgeSourceType.FILE_DOCX:
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case AiKnowledgeSourceType.FILE_TXT:
      return 'text/plain'
    default:
      return null
  }
}
