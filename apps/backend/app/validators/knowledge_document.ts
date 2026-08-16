import vine from '@vinejs/vine'
import { AI_KNOWLEDGE_SOURCE_TYPES } from '#enums/ai_knowledge_source_type'
import { AI_KNOWLEDGE_DOCUMENT_STATUSES } from '#enums/ai_knowledge_document_status'

export const createKnowledgeDocumentValidator = vine.create(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    sourceType: vine.enum(AI_KNOWLEDGE_SOURCE_TYPES),
    fileName: vine.string().trim().minLength(1).maxLength(255),
    mimeType: vine.string().trim().minLength(3).maxLength(255),
    fileSize: vine.number().withoutDecimals().min(1),
  })
)

export const knowledgeDocumentIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const listKnowledgeDocumentsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    status: vine.enum(AI_KNOWLEDGE_DOCUMENT_STATUSES).optional(),
    lifecycle: vine.enum(['active', 'deleted'] as const).optional(),
  })
)
