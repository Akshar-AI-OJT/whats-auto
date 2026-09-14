import { test } from '@japa/runner'
import type KnowledgeReindexService from '#services/ai/knowledge_reindex_service'
import { createAiReindexAllDocumentsHandler } from '#services/job_queue/handlers/ai_reindex_all_documents_handler'

test.group('ai.reindex_all_documents handler', () => {
  test('delegates to KnowledgeReindexService.run', async ({ assert }) => {
    let ran = 0
    const reindex = {
      async run() {
        ran += 1
      },
    } as unknown as KnowledgeReindexService

    const handler = createAiReindexAllDocumentsHandler(reindex)
    await handler({ id: '1', name: 'ai.reindex_all_documents', data: {} })
    assert.equal(ran, 1)
  })

  test('propagates run failures', async ({ assert }) => {
    const reindex = {
      async run() {
        throw new Error('reindex exploded')
      },
    } as unknown as KnowledgeReindexService

    const handler = createAiReindexAllDocumentsHandler(reindex)
    await assert.rejects(
      () => handler({ id: '1', name: 'ai.reindex_all_documents', data: {} }),
      'reindex exploded'
    )
  })
})
