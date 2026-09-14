import { test } from '@japa/runner'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import type KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import KnowledgeReindexService from '#services/ai/knowledge_reindex_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'

function runningSnapshot() {
  return {
    reindexStatus: 'running' as const,
    reindexFromSpaceId: 'old-space',
    reindexToSpaceId: 'new-space',
    reindexEmbeddingModel: 'gemini-embedding-2',
    reindexEmbeddingProvider: LlmChatProvider.Google,
  }
}

test.group('KnowledgeReindexService', () => {
  test('reindexes listed documents, flips the space, then GCs the old space', async ({
    assert,
  }) => {
    const events: string[] = []
    const reindexed: string[] = []
    const service = new KnowledgeReindexService({
      platform: {
        async get() {
          return runningSnapshot()
        },
        async completeReindex() {
          events.push('flip')
          return { fromSpaceId: 'old-space', toSpaceId: 'new-space' }
        },
        async markReindexFailed() {
          events.push('failed')
        },
      } as unknown as PlatformAiConfigService,
      ingest: {
        async reindexDocument(params: { documentId: string }) {
          reindexed.push(params.documentId)
          return {
            documentId: params.documentId,
            status: AiKnowledgeDocumentStatus.INDEXED,
            embedded: 2,
            deleted: 0,
            unchanged: 0,
            skipped: false,
          }
        },
      } as unknown as KnowledgeIngestService,
      listIndexed: async () => [{ organizationId: 'org-1', documentId: 'doc-1' }],
      listMissingInSpace: async () => [],
      deleteChunksInSpace: async (spaceId: string) => {
        events.push(`gc:${spaceId}`)
        return 3
      },
    })

    await service.run()
    assert.deepEqual(reindexed, ['doc-1'])
    assert.deepEqual(events, ['flip', 'gc:old-space'])
  })

  test('reindexes documents missing from the new space on the second pass', async ({ assert }) => {
    const reindexed: string[] = []
    let missingCalls = 0
    const service = new KnowledgeReindexService({
      platform: {
        async get() {
          return runningSnapshot()
        },
        async completeReindex() {
          return { fromSpaceId: 'old-space', toSpaceId: 'new-space' }
        },
        async markReindexFailed() {},
      } as unknown as PlatformAiConfigService,
      ingest: {
        async reindexDocument(params: { documentId: string }) {
          reindexed.push(params.documentId)
          return {
            documentId: params.documentId,
            status: AiKnowledgeDocumentStatus.INDEXED,
            embedded: 1,
            deleted: 0,
            unchanged: 0,
            skipped: false,
          }
        },
      } as unknown as KnowledgeIngestService,
      listIndexed: async () => [{ organizationId: 'org-1', documentId: 'doc-1' }],
      listMissingInSpace: async () => {
        missingCalls += 1
        if (missingCalls === 1) return [{ organizationId: 'org-1', documentId: 'doc-2' }]
        return []
      },
      deleteChunksInSpace: async () => 0,
    })

    await service.run()
    assert.deepEqual(reindexed, ['doc-1', 'doc-2'])
  })

  test('marks reindex failed and does not flip when a document embed throws', async ({
    assert,
  }) => {
    const events: string[] = []
    const service = new KnowledgeReindexService({
      platform: {
        async get() {
          return runningSnapshot()
        },
        async completeReindex() {
          events.push('flip')
          return { fromSpaceId: 'old-space', toSpaceId: 'new-space' }
        },
        async markReindexFailed() {
          events.push('failed')
        },
      } as unknown as PlatformAiConfigService,
      ingest: {
        async reindexDocument() {
          throw new Error('provider timeout')
        },
      } as unknown as KnowledgeIngestService,
      listIndexed: async () => [{ organizationId: 'org-1', documentId: 'doc-1' }],
      listMissingInSpace: async () => [],
      deleteChunksInSpace: async () => {
        events.push('gc')
        return 0
      },
    })

    await assert.rejects(() => service.run(), 'provider timeout')
    assert.deepEqual(events, ['failed'])
  })

  test('does nothing when reindexStatus is not running', async ({ assert }) => {
    let listed = false
    const service = new KnowledgeReindexService({
      platform: {
        async get() {
          return { reindexStatus: 'idle' }
        },
      } as unknown as PlatformAiConfigService,
      listIndexed: async () => {
        listed = true
        return []
      },
    })

    await service.run()
    assert.isFalse(listed)
  })
})
