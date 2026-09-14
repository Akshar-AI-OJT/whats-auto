import { test } from '@japa/runner'
import { type AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import type { KnowledgeChunkSearchHit } from '#repositories/ai_knowledge_chunk_repository'
import FakeLlmProvider, { fakeEmbeddingFor } from '#services/ai/drivers/fake_llm_provider'
import { DEFAULT_EMBEDDING_SPACE_ID } from '#services/ai/embedding_space'
import PassthroughRerankerService from '#services/ai/drivers/passthrough_reranker_service'
import KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function hits(rows: Array<Partial<KnowledgeChunkSearchHit> & { id: string; vectorScore: number }>) {
  return rows.map((row, index) => ({
    id: row.id,
    documentId: row.documentId ?? 'doc-1',
    content: row.content ?? row.id,
    metadata: row.metadata ?? null,
    chunkIndex: row.chunkIndex ?? index,
    vectorScore: row.vectorScore,
  }))
}

function createService(params: {
  searchHits?: KnowledgeChunkSearchHit[]
  minConfidenceScore?: number
  embeddingModel?: string
  activeEmbeddingSpaceId?: string
}) {
  const llm = new FakeLlmProvider()
  const searches: Array<{ embeddingSpaceId: string }> = []
  const chunks = {
    async searchByEmbedding(input: { embeddingSpaceId: string }) {
      searches.push(input)
      return params.searchHits ?? []
    },
  } as unknown as AiKnowledgeChunkRepository
  const platform = {
    async get() {
      return {
        minConfidenceScore: params.minConfidenceScore ?? 0.7,
        embeddingModel: params.embeddingModel ?? 'text-embedding-3-small',
        activeEmbeddingSpaceId: params.activeEmbeddingSpaceId,
      }
    },
  } as unknown as PlatformAiConfigService

  return {
    llm,
    searches,
    service: new KnowledgeRetrievalService(chunks, llm, platform, new PassthroughRerankerService()),
  }
}

test.group('KnowledgeRetrievalService', () => {
  test('empty query returns score 0 and does not embed', async ({ assert }) => {
    const { service, llm } = createService({
      searchHits: hits([{ id: 'a', vectorScore: 0.9 }]),
    })

    const result = await service.retrieve({ organizationId: ORG, query: '   ' })

    assert.deepEqual(result.chunks, [])
    assert.equal(result.maxScore, 0)
    assert.isFalse(result.meetsMinConfidence)
    assert.isNull(result.campaign)
    assert.lengthOf(llm.embedCalls, 0)
  })

  test('empty KB returns score 0', async ({ assert }) => {
    const { service, llm, searches } = createService({ searchHits: [] })

    const result = await service.retrieve({ organizationId: ORG, query: 'hours?' })

    assert.deepEqual(result.chunks, [])
    assert.equal(result.maxScore, 0)
    assert.isFalse(result.meetsMinConfidence)
    assert.deepEqual(llm.embedCalls, ['hours?'])
    assert.deepEqual(llm.embedModels, ['text-embedding-3-small'])
    assert.equal(searches[0]!.embeddingSpaceId, DEFAULT_EMBEDDING_SPACE_ID)
    assert.deepEqual(await llm.embedTexts(['hours?']), [fakeEmbeddingFor('hours?')])
  })

  test('passthrough keeps the top N by vector score and compares max to minConfidence', async ({
    assert,
  }) => {
    const { service } = createService({
      minConfidenceScore: 0.7,
      searchHits: hits([
        { id: 'low', content: 'unrelated', vectorScore: 0.2 },
        { id: 'high', content: 'Open 9-5', vectorScore: 0.91, documentId: 'doc-hours' },
        { id: 'mid', content: 'weekdays', vectorScore: 0.74 },
      ]),
    })

    const result = await service.retrieve({
      organizationId: ORG,
      query: 'hours',
      topK: 10,
      topN: 2,
    })

    assert.deepEqual(
      result.chunks.map((chunk) => chunk.id),
      ['high', 'mid']
    )
    assert.equal(result.chunks[0]!.documentId, 'doc-hours')
    assert.equal(result.maxScore, 0.91)
    assert.equal(result.minConfidenceScore, 0.7)
    assert.isTrue(result.meetsMinConfidence)
  })

  test('max score below the platform threshold fails confidence', async ({ assert }) => {
    const { service } = createService({
      minConfidenceScore: 0.8,
      searchHits: hits([{ id: 'weak', content: 'maybe', vectorScore: 0.55 }]),
    })

    const result = await service.retrieve({ organizationId: ORG, query: 'hours' })

    assert.equal(result.maxScore, 0.55)
    assert.isFalse(result.meetsMinConfidence)
  })

  test('embeds with embeddingModel and searches the active space', async ({ assert }) => {
    const { service, llm, searches } = createService({
      embeddingModel: 'text-embedding-3-large',
      activeEmbeddingSpaceId: 'openai:text-embedding-3-large:1024:v1',
      searchHits: hits([{ id: 'a', vectorScore: 0.9 }]),
    })

    await service.retrieve({ organizationId: ORG, query: 'hours' })

    assert.deepEqual(llm.embedModels, ['text-embedding-3-large'])
    assert.equal(searches[0]!.embeddingSpaceId, 'openai:text-embedding-3-large:1024:v1')
  })
})
