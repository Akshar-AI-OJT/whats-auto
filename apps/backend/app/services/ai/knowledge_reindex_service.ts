import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import type { LlmChatProvider } from '#enums/llm_chat_provider'
import { AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'

export type ReindexDocumentRef = {
  organizationId: string
  documentId: string
}

export type KnowledgeReindexDeps = {
  platform?: PlatformAiConfigService
  ingest?: KnowledgeIngestService
  documents?: AiKnowledgeDocumentRepository
  chunks?: AiKnowledgeChunkRepository
  listIndexed?: () => Promise<ReindexDocumentRef[]>
  listMissingInSpace?: (spaceId: string) => Promise<ReindexDocumentRef[]>
  deleteChunksInSpace?: (spaceId: string) => Promise<number>
}

/**
 * Re-embed every INDEXED document into the pending embedding space, then flip
 * activeEmbeddingSpaceId and GC the old space. Retrieval stays on the old
 * space until this completes.
 */
export default class KnowledgeReindexService {
  constructor(private deps: KnowledgeReindexDeps = {}) {}

  async run(): Promise<void> {
    const platform = await this.#platform()
    const config = await platform.get()
    if (config.reindexStatus !== 'running') return

    const fromSpaceId = config.reindexFromSpaceId
    const toSpaceId = config.reindexToSpaceId
    const embeddingModel = config.reindexEmbeddingModel
    const embeddingProvider = config.reindexEmbeddingProvider
    if (!fromSpaceId || !toSpaceId || !embeddingModel || !embeddingProvider) {
      throw new Error('Platform AI reindex is running but pending fields are missing')
    }

    try {
      await this.#reindexList(await this.#listIndexed(), {
        embeddingModel,
        embeddingProvider,
        targetSpaceId: toSpaceId,
      })
      await this.#reindexList(await this.#listMissing(toSpaceId), {
        embeddingModel,
        embeddingProvider,
        targetSpaceId: toSpaceId,
      })
      const leftover = await this.#listMissing(toSpaceId)
      if (leftover.length > 0) {
        throw new Error(
          `${leftover.length} indexed document(s) still missing chunks in ${toSpaceId}`
        )
      }

      const flipped = await platform.completeReindex()
      try {
        const deleted = await this.#gc(flipped.fromSpaceId)
        logger.info(
          { fromSpaceId: flipped.fromSpaceId, toSpaceId: flipped.toSpaceId, deleted },
          'ai.reindex_all_documents.gc'
        )
      } catch (error) {
        logger.error(
          {
            fromSpaceId: flipped.fromSpaceId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'ai.reindex_all_documents.gc_failed'
        )
      }
    } catch (error) {
      await platform.markReindexFailed()
      throw error
    }
  }

  async #reindexList(
    docs: ReindexDocumentRef[],
    dest: {
      embeddingModel: string
      embeddingProvider: LlmChatProvider
      targetSpaceId: string
    }
  ): Promise<void> {
    const ingest = this.#ingest()
    for (const doc of docs) {
      const result = await ingest.reindexDocument({
        organizationId: doc.organizationId,
        documentId: doc.documentId,
        embeddingModel: dest.embeddingModel,
        embeddingProvider: dest.embeddingProvider,
        targetSpaceId: dest.targetSpaceId,
      })
      logger.info(
        {
          organizationId: doc.organizationId,
          documentId: doc.documentId,
          status: result.status,
          embedded: result.embedded,
          skipped: result.skipped,
        },
        'ai.reindex_all_documents.document'
      )
    }
  }

  async #platform(): Promise<PlatformAiConfigService> {
    if (this.deps.platform) return this.deps.platform
    return app.container.make(PlatformAiConfigService)
  }

  #ingest(): KnowledgeIngestService {
    return this.deps.ingest ?? new KnowledgeIngestService()
  }

  #listIndexed(): Promise<ReindexDocumentRef[]> {
    if (this.deps.listIndexed) return this.deps.listIndexed()
    const documents = this.deps.documents ?? new AiKnowledgeDocumentRepository()
    return documents.listIndexedForReindex()
  }

  #listMissing(spaceId: string): Promise<ReindexDocumentRef[]> {
    if (this.deps.listMissingInSpace) return this.deps.listMissingInSpace(spaceId)
    const documents = this.deps.documents ?? new AiKnowledgeDocumentRepository()
    return documents.listIndexedMissingSpace(spaceId)
  }

  #gc(spaceId: string): Promise<number> {
    if (this.deps.deleteChunksInSpace) return this.deps.deleteChunksInSpace(spaceId)
    const chunks = this.deps.chunks ?? new AiKnowledgeChunkRepository()
    return chunks.deleteAllInSpace(spaceId)
  }
}
