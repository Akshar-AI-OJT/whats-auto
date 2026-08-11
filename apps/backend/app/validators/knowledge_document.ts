import vine from '@vinejs/vine'
import { AI_KNOWLEDGE_SOURCE_TYPES } from '#enums/ai_knowledge_source_type'
import { AI_KNOWLEDGE_DOCUMENT_STATUSES } from '#enums/ai_knowledge_document_status'

export const createKnowledgeDocumentValidator = vine.create(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    sourceType: vine.enum(AI_KNOWLEDGE_SOURCE_TYPES),
    text: vine.string().trim().minLength(1).maxLength(100_000).optional(),
    fileName: vine.string().trim().minLength(1).maxLength(255).optional(),
    mimeType: vine.string().trim().minLength(3).maxLength(255).optional(),
    fileSize: vine.number().withoutDecimals().min(1).optional(),
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
  })
)
