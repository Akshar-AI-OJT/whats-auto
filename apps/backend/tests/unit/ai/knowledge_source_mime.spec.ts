import { test } from '@japa/runner'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import KnowledgeDocumentException from '#exceptions/knowledge_document_exception'
import {
  mimeTypeForKnowledgeSource,
  KNOWLEDGE_CREATE_SOURCE_TYPES,
} from '#services/ai/knowledge_source_mime'
import KnowledgeDocumentService from '#services/ai/knowledge_document_service'

test.group('Knowledge source MIME', () => {
  test('maps supported source types to a single MIME', ({ assert }) => {
    assert.equal(mimeTypeForKnowledgeSource(AiKnowledgeSourceType.FILE_PDF), 'application/pdf')
    assert.equal(
      mimeTypeForKnowledgeSource(AiKnowledgeSourceType.FILE_DOCX),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    assert.equal(mimeTypeForKnowledgeSource(AiKnowledgeSourceType.FILE_TXT), 'text/plain')
  })

  test('create source types are pdf, docx, and txt files', ({ assert }) => {
    assert.deepEqual(
      [...KNOWLEDGE_CREATE_SOURCE_TYPES],
      [
        AiKnowledgeSourceType.FILE_PDF,
        AiKnowledgeSourceType.FILE_DOCX,
        AiKnowledgeSourceType.FILE_TXT,
      ]
    )
  })
})

test.group('KnowledgeDocumentService validation', () => {
  const base = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    actorUserId: '00000000-0000-4000-8000-000000000002',
    title: 'Hours',
  }

  test('rejects files without upload fields', async ({ assert }) => {
    const service = new KnowledgeDocumentService()

    await assert.rejects(
      () =>
        service.create({
          ...base,
          sourceType: AiKnowledgeSourceType.FILE_PDF,
          fileName: '',
          mimeType: '',
          fileSize: 0,
        } as any),
      /fileName, mimeType, and fileSize/
    )
  })

  test('rejects a PDF source with the wrong MIME', async ({ assert }) => {
    const service = new KnowledgeDocumentService()

    await assert.rejects(
      () =>
        service.create({
          ...base,
          sourceType: AiKnowledgeSourceType.FILE_PDF,
          fileName: 'hours.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 120,
        }),
      /mimeType must be application\/pdf/
    )
  })

  test('exception factories set HTTP codes', ({ assert }) => {
    const missing = KnowledgeDocumentException.notFound()
    const unsupported = KnowledgeDocumentException.sourceUnsupported('UNKNOWN')
    const invalid = KnowledgeDocumentException.invalidCreate('bad')

    assert.equal(missing.status, 404)
    assert.equal(missing.code, 'E_KNOWLEDGE_DOCUMENT_NOT_FOUND')
    assert.equal(unsupported.status, 422)
    assert.equal(unsupported.code, 'E_KNOWLEDGE_SOURCE_UNSUPPORTED')
    assert.equal(invalid.status, 422)
    assert.equal(invalid.code, 'E_KNOWLEDGE_DOCUMENT_INVALID')
  })
})
