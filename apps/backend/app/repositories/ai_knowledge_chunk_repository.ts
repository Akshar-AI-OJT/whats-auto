import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  assertEmbeddingDimensions,
  DEFAULT_EMBEDDING_SPACE_ID,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from '#services/ai/embedding_space'

export { KNOWLEDGE_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_SPACE_ID }

export type AiKnowledgeChunkHashRow = {
  id: string
  contentHash: string
  chunkIndex: number
}

export type KnowledgeChunkSearchHit = {
  id: string
  documentId: string
  content: string
  metadata: Record<string, unknown> | null
  chunkIndex: number
  vectorScore: number
}

export type InsertKnowledgeChunkParams = {
  organizationId: string
  documentId: string
  chunkIndex: number
  contentHash: string
  content: string
  embedding: number[]
  embeddingSpaceId?: string
  metadata?: Record<string, unknown> | null
}

type Db = typeof db | TransactionClientContract

export class AiKnowledgeChunkRepository {
  async listHashesForDocument(
    params: { organizationId: string; documentId: string; embeddingSpaceId?: string },
    client: Db = db
  ): Promise<AiKnowledgeChunkHashRow[]> {
    const query = client
      .from('ai_knowledge_chunks')
      .where('organizationId', params.organizationId)
      .where('documentId', params.documentId)
    if (params.embeddingSpaceId) {
      query.where('embeddingSpaceId', params.embeddingSpaceId)
    }
    const rows = await query.orderBy('chunkIndex', 'asc').select('id', 'contentHash', 'chunkIndex')

    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      contentHash: row.contentHash as string,
      chunkIndex: Number(row.chunkIndex),
    }))
  }

  async insertMany(rows: InsertKnowledgeChunkParams[], client: Db = db): Promise<void> {
    for (const row of rows) {
      await client.table('ai_knowledge_chunks').insert({
        id: randomUUID(),
        organizationId: row.organizationId,
        documentId: row.documentId,
        chunkIndex: row.chunkIndex,
        contentHash: row.contentHash,
        content: row.content,
        metadata: row.metadata ?? null,
        embeddingSpaceId: row.embeddingSpaceId ?? DEFAULT_EMBEDDING_SPACE_ID,
        embedding: client.raw('?::vector', [toVectorLiteral(row.embedding)]),
      })
    }
  }

  async deleteByIds(
    params: { organizationId: string; documentId: string; ids: string[] },
    client: Db = db
  ): Promise<void> {
    if (params.ids.length === 0) return
    await client
      .from('ai_knowledge_chunks')
      .where('organizationId', params.organizationId)
      .where('documentId', params.documentId)
      .whereIn('id', params.ids)
      .delete()
  }

  async deleteByDocumentSpace(
    params: { organizationId: string; documentId: string; embeddingSpaceId: string },
    client: Db = db
  ): Promise<void> {
    await client
      .from('ai_knowledge_chunks')
      .where('organizationId', params.organizationId)
      .where('documentId', params.documentId)
      .where('embeddingSpaceId', params.embeddingSpaceId)
      .delete()
  }

  /**
   * Cross-tenant GC. FORCE RLS would hide rows without a tenant GUC.
   */
  async deleteAllInSpace(spaceId: string): Promise<number> {
    const result = await db.rawQuery('SELECT delete_ai_knowledge_chunks_in_space(?) AS total', [
      spaceId,
    ])
    const rows = (result.rows ?? result) as Array<{ total: string | number }>
    return Number(rows[0]?.total ?? 0)
  }

  /**
   * Org-scoped cosine search. Callers must run inside runWithTenant.
   * Score is 1 - cosine distance (higher is closer).
   */
  async searchByEmbedding(
    params: {
      organizationId: string
      embedding: number[]
      limit: number
      embeddingSpaceId: string
    },
    client: Db = db
  ): Promise<KnowledgeChunkSearchHit[]> {
    if (params.limit <= 0) return []

    const literal = toVectorLiteral(params.embedding)
    const result = await client.rawQuery(
      `SELECT
         c.id,
         c."documentId",
         c.content,
         c.metadata,
         c."chunkIndex",
         1 - (c.embedding <=> ?::vector) AS score
       FROM "ai_knowledge_chunks" c
       INNER JOIN "ai_knowledge_documents" d ON d.id = c."documentId"
       WHERE c."organizationId" = ?
         AND d."organizationId" = ?
         AND d.status = 'INDEXED'
         AND d."deletedAt" IS NULL
         AND c."embeddingSpaceId" = ?
       ORDER BY c.embedding <=> ?::vector
       LIMIT ?`,
      [
        literal,
        params.organizationId,
        params.organizationId,
        params.embeddingSpaceId,
        literal,
        params.limit,
      ]
    )

    const rows = (result.rows ?? result) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: row.id as string,
      documentId: row.documentId as string,
      content: row.content as string,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      chunkIndex: Number(row.chunkIndex),
      vectorScore: Number(row.score),
    }))
  }

  async updateChunkIndexes(
    params: {
      organizationId: string
      updates: Array<{ id: string; chunkIndex: number }>
    },
    client: Db = db
  ): Promise<void> {
    for (const update of params.updates) {
      await client
        .from('ai_knowledge_chunks')
        .where('organizationId', params.organizationId)
        .where('id', update.id)
        .update({ chunkIndex: update.chunkIndex })
    }
  }
}

export function toVectorLiteral(values: number[]): string {
  assertEmbeddingDimensions(values)
  return `[${values.join(',')}]`
}
