import { test } from '@japa/runner'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import type KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import { createAiProcessDocumentHandler } from '#services/job_queue/handlers/ai_process_document_handler'

test.group('ai.process_document handler', () => {
  test('ignores an invalid payload', async ({ assert }) => {
    const ingest = {
      process() {
        throw new Error('should not run')
      },
    } as unknown as KnowledgeIngestService

    const handler = createAiProcessDocumentHandler(ingest)
    await handler({ id: '1', name: 'ai.process_document', data: {} })
    assert.isTrue(true)
  })

  test('delegates a valid payload to ingest', async ({ assert }) => {
    const seen: Array<{ organizationId: string; documentId: string }> = []
    const ingest = {
      async process(params: { organizationId: string; documentId: string }) {
        seen.push(params)
        return {
          documentId: params.documentId,
          status: AiKnowledgeDocumentStatus.INDEXED,
          embedded: 1,
          deleted: 0,
          unchanged: 0,
          skipped: false,
        }
      },
    } as unknown as KnowledgeIngestService

    const handler = createAiProcessDocumentHandler(ingest)
    await handler({
      id: '1',
      name: 'ai.process_document',
      data: {
        organizationId: 'org-1',
        documentId: 'doc-1',
      },
    })

    assert.deepEqual(seen, [{ organizationId: 'org-1', documentId: 'doc-1' }])
  })
})
