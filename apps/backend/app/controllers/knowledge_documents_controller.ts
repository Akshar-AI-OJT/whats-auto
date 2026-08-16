import type { HttpContext } from '@adonisjs/core/http'
import type { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import KnowledgeDocumentPolicy from '#policies/knowledge_document_policy'
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
   * @description Tenant-scoped KB documents. Requires ai:kb_view. Default lifecycle=active.
   * @tag AI
   * @security BearerAuth
   * @paramQuery page - Page number - @type(number)
   * @paramQuery perPage - Page size - @type(number)
   * @paramQuery status - Filter by status - @type(string)
   * @paramQuery lifecycle - active or deleted - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "title": "Policy", "sourceType": "FILE_PDF", "status": "PENDING" }], "meta": { "total": 1 } }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(KnowledgeDocumentPolicy).authorize('viewList')

    const params = await request.validateUsing(listKnowledgeDocumentsValidator, {
      data: request.qs(),
    })

    const result = await new KnowledgeDocumentService().list({
      organizationId: request.activeMember!.organizationId,
      page: params.page,
      perPage: params.perPage,
      status: params.status,
      lifecycle: params.lifecycle,
    })

    return serialize(result)
  }

  /**
   * @store
   * @summary Create a knowledge document
   * @description FILE_PDF / FILE_DOCX / FILE_TXT return a presigned PUT. Complete with complete-upload after the browser PUT. Status is PENDING.
   * @tag AI
   * @security BearerAuth
   * @requestBody { "title": "Hours", "sourceType": "FILE_TXT", "fileName": "hours.txt", "mimeType": "text/plain", "fileSize": 24 }
   * @responseBody 200 - { "data": { "document": { "id": "uuid", "status": "PENDING" }, "upload": { "method": "PUT", "url": "https://s3..." } } }
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(KnowledgeDocumentPolicy).authorize('create')

    const payload = await request.validateUsing(createKnowledgeDocumentValidator)
    const result = await new KnowledgeDocumentService().create({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      title: payload.title,
      sourceType: payload.sourceType as AiKnowledgeSourceType,
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
  async show({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })

    await bouncer.with(KnowledgeDocumentPolicy).authorize('view', {
      organizationId: request.activeMember!.organizationId,
      id,
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
  async completeUpload({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })

    await bouncer.with(KnowledgeDocumentPolicy).authorize('completeUpload', {
      organizationId: request.activeMember!.organizationId,
      id,
    })

    const document = await new KnowledgeDocumentService().completeUpload({
      organizationId: request.activeMember!.organizationId,
      documentId: id,
    })
    return serialize(document)
  }

  /**
   * @destroy
   * @summary Soft-delete a knowledge document
   * @description Marks deletedAt; linked ready media is soft-deleted. Requires ai:kb_manage.
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })

    const organizationId = request.activeMember!.organizationId
    const existing = await new KnowledgeDocumentService().get({
      organizationId,
      documentId: id,
    })

    await bouncer.with(KnowledgeDocumentPolicy).authorize('destroy', {
      organizationId,
      id,
      deletedAt: existing.deletedAt,
    })

    const document = await new KnowledgeDocumentService().softDelete({
      organizationId,
      documentId: id,
    })
    return serialize(document)
  }

  /**
   * @restore
   * @summary Restore a soft-deleted knowledge document
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async restore({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })

    const organizationId = request.activeMember!.organizationId
    const existing = await new KnowledgeDocumentService().get({
      organizationId,
      documentId: id,
    })

    await bouncer.with(KnowledgeDocumentPolicy).authorize('restore', {
      organizationId,
      id,
      deletedAt: existing.deletedAt,
    })

    const document = await new KnowledgeDocumentService().restore({
      organizationId,
      documentId: id,
    })
    return serialize(document)
  }

  /**
   * @purge
   * @summary Permanently purge a soft-deleted knowledge document
   * @tag AI
   * @security BearerAuth
   * @paramPath id - Document id - @type(string)
   */
  async purge({ bouncer, request, params, response }: HttpContext) {
    const { id } = await request.validateUsing(knowledgeDocumentIdParamValidator, {
      data: params,
    })

    const organizationId = request.activeMember!.organizationId
    const existing = await new KnowledgeDocumentService().get({
      organizationId,
      documentId: id,
    })

    await bouncer.with(KnowledgeDocumentPolicy).authorize('purge', {
      organizationId,
      id,
      deletedAt: existing.deletedAt,
    })

    await new KnowledgeDocumentService().purge({
      organizationId,
      documentId: id,
    })
    return response.ok({ data: { ok: true } })
  }
}
