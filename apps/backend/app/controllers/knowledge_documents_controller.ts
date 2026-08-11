import type { HttpContext } from '@adonisjs/core/http'
import type { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import KnowledgeDocumentService from '#services/ai/knowledge_document_service'
import {
  createKnowledgeDocumentValidator,
  knowledgeDocumentIdParamValidator,
  listKnowledgeDocumentsValidator,
} from '#validators/knowledge_document'
import '#types/http'

export default class KnowledgeDocumentsController {
  /**
   * @index
   * @summary List knowledge documents
   * @description Tenant-scoped KB documents. Requires ai:kb_view. Status stays PENDING until ingest (Phase 6).
   * @tag AI
   * @security BearerAuth
   * @paramQuery page - Page number - @type(number)
   * @paramQuery perPage - Page size - @type(number)
   * @paramQuery status - Filter by status - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "title": "FAQ", "sourceType": "MANUAL_TEXT", "status": "PENDING" }], "meta": { "total": 1 } }
   */
  async index({ request, serialize }: HttpContext) {
    const params = await request.validateUsing(listKnowledgeDocumentsValidator, {
      data: request.qs(),
    })

    const result = await new KnowledgeDocumentService().list({
      organizationId: request.activeMember!.organizationId,
      page: params.page,
      perPage: params.perPage,
      status: params.status,
    })

    return serialize(result)
  }

  /**
   * @store
   * @summary Create a knowledge document
   * @description FILE_PDF/FILE_DOCX return a presigned PUT. MANUAL_TEXT writes to S3 immediately. Status is PENDING.
   * @tag AI
   * @security BearerAuth
   * @requestBody { "title": "Hours", "sourceType": "MANUAL_TEXT", "text": "Open 9-5" }
   * @responseBody 200 - { "data": { "document": { "id": "uuid", "status": "PENDING" }, "upload": { "method": "PUT", "url": "https://s3..." } } }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createKnowledgeDocumentValidator)
    const result = await new KnowledgeDocumentService().create({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      title: payload.title,
      sourceType: payload.sourceType as AiKnowledgeSourceType,
      text: payload.text,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
    })
    return serialize(result)
  }

  /**
   * @show
   * @summary Get one knowledge document
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })
    const document = await new KnowledgeDocumentService().get({
      organizationId: request.activeMember!.organizationId,
      documentId: id,
    })
    return serialize(document)
  }

  /**
   * @completeUpload
   * @summary Complete a knowledge file upload
   * @description HeadObject-verifies the knowledge_base object after the browser PUT.
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async completeUpload({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })
    const document = await new KnowledgeDocumentService().completeUpload({
      organizationId: request.activeMember!.organizationId,
      documentId: id,
    })
    return serialize(document)
  }

  /**
   * @destroy
   * @summary Delete a knowledge document
   * @description Deletes the document row; chunks cascade. Linked media is soft-deleted when ready.
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async destroy({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })
    await new KnowledgeDocumentService().delete({
      organizationId: request.activeMember!.organizationId,
      documentId: id,
    })
    return serialize({ ok: true })
  }
}
