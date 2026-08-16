import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import {
  AiKnowledgeChunkRepository,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from '#repositories/ai_knowledge_chunk_repository'
import { type LlmProvider } from '#services/ai/contracts/llm_provider'
import KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { runWithTenant } from '#services/tenant_context'

function axisEmbedding(axis: number): number[] {
  const values = new Array<number>(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(0)
  values[axis] = 1
  return values
}

async function createOrg(label: string) {
  const id = randomUUID()
  const slug = `kb-retr-${label}-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `KB ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'US',
    timezone: 'UTC',
    currency: 'USD',
    status: true,
  })
  return id
}

async function insertIndexedChunk(params: {
  organizationId: string
  content: string
  embedding: number[]
  embeddingSpaceId?: string
}) {
  const [document] = await runWithTenant(params.organizationId, () =>
    db
      .table('ai_knowledge_documents')
      .insert({
        organizationId: params.organizationId,
        title: params.content,
        sourceType: AiKnowledgeSourceType.FILE_TXT,
        status: AiKnowledgeDocumentStatus.INDEXED,
        chunkCount: 1,
      })
      .returning(['id'])
  )

  await runWithTenant(params.organizationId, () =>
    new AiKnowledgeChunkRepository().insertMany([
      {
        organizationId: params.organizationId,
        documentId: document.id as string,
        chunkIndex: 0,
        contentHash: `hash-${document.id}`,
        content: params.content,
        embedding: params.embedding,
        embeddingSpaceId: params.embeddingSpaceId,
      },
    ])
  )

  return document.id as string
}

test.group('Knowledge retrieval', () => {
  test('isolates tenants, scores empty KB as 0, and loads an org campaign row', async ({
    assert,
  }) => {
    const orgA = await createOrg('a')
    const orgB = await createOrg('b')
    await insertIndexedChunk({
      organizationId: orgA,
      content: 'Northstar hours are 9-5',
      embedding: axisEmbedding(0),
    })
    await insertIndexedChunk({
      organizationId: orgB,
      content: 'Harbor is closed Sundays',
      embedding: axisEmbedding(1),
    })

    const [campaign] = await runWithTenant(orgA, () =>
      db
        .table('broadcasts')
        .insert({
          organizationId: orgA,
          name: 'July launch',
          status: 'sent',
        })
        .returning(['id'])
    )

    const llm = {
      async embedTexts() {
        return [axisEmbedding(0)]
      },
    } as unknown as LlmProvider
    const platform = {
      async get() {
        return { minConfidenceScore: 0.7, embeddingModel: 'text-embedding-3-small' }
      },
    } as unknown as PlatformAiConfigService
    const retrieval = new KnowledgeRetrievalService(new AiKnowledgeChunkRepository(), llm, platform)

    const fromA = await retrieval.retrieve({
      organizationId: orgA,
      query: 'hours',
      campaignId: campaign.id as string,
    })
    assert.lengthOf(fromA.chunks, 1)
    assert.include(fromA.chunks[0]!.content, 'Northstar')
    assert.isAbove(fromA.maxScore, 0.99)
    assert.isTrue(fromA.meetsMinConfidence)
    assert.equal(fromA.campaign?.name, 'July launch')

    const fromB = await retrieval.retrieve({
      organizationId: orgB,
      query: 'hours',
      campaignId: campaign.id as string,
    })
    assert.isFalse(fromB.chunks.some((chunk) => chunk.content.includes('Northstar')))
    assert.isNull(fromB.campaign)

    const emptyOrg = await createOrg('empty')
    const empty = await retrieval.retrieve({
      organizationId: emptyOrg,
      query: 'hours',
    })
    assert.deepEqual(empty.chunks, [])
    assert.equal(empty.maxScore, 0)
    assert.isFalse(empty.meetsMinConfidence)
    assert.isNull(empty.campaign)
  })

  test('searchByEmbedding only returns chunks in the active embedding space', async ({
    assert,
  }) => {
    const org = await createOrg('space')
    await insertIndexedChunk({
      organizationId: org,
      content: 'Hours in the active space',
      embedding: axisEmbedding(0),
      embeddingSpaceId: 'openai:text-embedding-3-small:1024:v1',
    })
    await insertIndexedChunk({
      organizationId: org,
      content: 'Hours in an old space',
      embedding: axisEmbedding(0),
      embeddingSpaceId: 'mistral:mistral-embed:1024:v1',
    })

    const llm = {
      async embedTexts() {
        return [axisEmbedding(0)]
      },
    } as unknown as LlmProvider
    const platform = {
      async get() {
        return {
          minConfidenceScore: 0.7,
          embeddingModel: 'text-embedding-3-small',
          activeEmbeddingSpaceId: 'openai:text-embedding-3-small:1024:v1',
        }
      },
    } as unknown as PlatformAiConfigService
    const retrieval = new KnowledgeRetrievalService(new AiKnowledgeChunkRepository(), llm, platform)

    const result = await retrieval.retrieve({ organizationId: org, query: 'hours' })
    assert.lengthOf(result.chunks, 1)
    assert.include(result.chunks[0]!.content, 'active space')
  })
})
