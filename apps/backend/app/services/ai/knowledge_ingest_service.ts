import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { type LlmChatProvider } from '#enums/llm_chat_provider'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { MediaAssetRepository } from '#repositories/media_asset_repository'
import { chunkKnowledgeText } from '#services/ai/chunk_knowledge_text'
import { type EmbeddingLlmProvider } from '#services/ai/contracts/llm_provider'
import { DEFAULT_EMBEDDING_SPACE_ID } from '#services/ai/embedding_space'
import { extractKnowledgeText } from '#services/ai/extract_knowledge_text'
import { sha256Hex } from '#services/ai/knowledge_hash'
import { estimateTokensFromChars } from '#services/ai/llm_pricing'
import LlmProviderFactory from '#services/ai/llm_provider_factory'
import { planChunkSync } from '#services/ai/plan_chunk_sync'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import { runWithTenant } from '#services/tenant_context'

const EMBED_BATCH_SIZE = 64
const MAX_ERROR_LENGTH = 2000

export type KnowledgeIngestResult = {
  documentId: string
  status: AiKnowledgeDocumentStatus
  embedded: number
  deleted: number
  unchanged: number
  skipped: boolean
}

export default class KnowledgeIngestService {
  constructor(
    private documents: AiKnowledgeDocumentRepository = new AiKnowledgeDocumentRepository(),
    private chunks: AiKnowledgeChunkRepository = new AiKnowledgeChunkRepository(),
    private mediaAssets: MediaAssetRepository = new MediaAssetRepository(),
    private storage?: ObjectStorage,
    private llm?: EmbeddingLlmProvider,
    private platform?: PlatformAiConfigService,
    private usage: AiUsageLogRepository = new AiUsageLogRepository()
  ) {}

  async process(params: {
    organizationId: string
    documentId: string
  }): Promise<KnowledgeIngestResult> {
    const document = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg(params)
    )
    if (!document) {
      return {
        documentId: params.documentId,
        status: AiKnowledgeDocumentStatus.FAILED,
        embedded: 0,
        deleted: 0,
        unchanged: 0,
        skipped: true,
      }
    }

    if (document.deletedAt) {
      return {
        documentId: params.documentId,
        status: document.status as AiKnowledgeDocumentStatus,
        embedded: 0,
        deleted: 0,
        unchanged: 0,
        skipped: true,
      }
    }

    try {
      await this.#mark(params, {
        status: AiKnowledgeDocumentStatus.PROCESSING,
        errorMessage: null,
      })

      const text = await this.#loadText(params.organizationId, document)
      if (!text) {
        return this.#fail(params, 'Extracted text is empty')
      }

      const documentHash = sha256Hex(text)
      if (document.documentHash === documentHash) {
        await this.#mark(params, {
          status: AiKnowledgeDocumentStatus.INDEXED,
          errorMessage: null,
          documentHash,
          chunkCount: document.chunkCount,
        })
        return {
          documentId: params.documentId,
          status: AiKnowledgeDocumentStatus.INDEXED,
          embedded: 0,
          deleted: 0,
          unchanged: document.chunkCount,
          skipped: true,
        }
      }

      const next = await chunkKnowledgeText(text)
      if (next.length === 0) {
        return this.#fail(params, 'No chunks produced from document text')
      }

      const dest = await this.#embedDestination()
      const existing = await runWithTenant(params.organizationId, () =>
        this.chunks.listHashesForDocument({
          ...params,
          embeddingSpaceId: dest.embeddingSpaceId,
        })
      )
      const plan = planChunkSync(existing, next)
      const embeddings = await this.#embed(
        plan.toInsert.map((chunk) => chunk.content),
        dest.embeddingModel,
        dest.embeddingProvider,
        { organizationId: params.organizationId, operationType: 'document_index' }
      )

      await runWithTenant(params.organizationId, () =>
        db.transaction(async (trx) => {
          await this.chunks.deleteByIds({ ...params, ids: plan.toDeleteIds }, trx)
          await this.chunks.updateChunkIndexes(
            {
              organizationId: params.organizationId,
              updates: plan.unchanged.map((chunk) => ({
                id: chunk.existingId,
                chunkIndex: chunk.chunkIndex,
              })),
            },
            trx
          )
          await this.chunks.insertMany(
            plan.toInsert.map((chunk, index) => ({
              organizationId: params.organizationId,
              documentId: params.documentId,
              chunkIndex: chunk.chunkIndex,
              contentHash: chunk.contentHash,
              content: chunk.content,
              embedding: embeddings[index]!,
              embeddingSpaceId: dest.embeddingSpaceId,
              metadata: { sourceType: document.sourceType },
            })),
            trx
          )
          await this.documents.updateForOrg(
            {
              ...params,
              status: AiKnowledgeDocumentStatus.INDEXED,
              documentHash,
              chunkCount: next.length,
              embeddingModel: dest.embeddingModel,
              errorMessage: null,
            },
            trx
          )
        })
      )

      return {
        documentId: params.documentId,
        status: AiKnowledgeDocumentStatus.INDEXED,
        embedded: plan.toInsert.length,
        deleted: plan.toDeleteIds.length,
        unchanged: plan.unchanged.length,
        skipped: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Knowledge ingest failed'
      logger.error(
        { organizationId: params.organizationId, documentId: params.documentId, err: message },
        'ai.process_document.failed'
      )
      return this.#fail(params, message)
    }
  }

  async #loadText(
    organizationId: string,
    document: { mediaAssetId: string | null; sourceType: string }
  ): Promise<string> {
    if (!document.mediaAssetId) {
      throw new Error('Document has no media asset')
    }

    const asset = await runWithTenant(organizationId, () =>
      this.mediaAssets.findByIdForOrg({
        organizationId,
        mediaAssetId: document.mediaAssetId!,
      })
    )
    if (!asset) {
      throw new Error('Knowledge file was not found')
    }
    if (asset.state !== 'ready') {
      throw new Error('Knowledge file upload is not complete')
    }

    const storage = await this.#objectStorage()
    const bytes = await storage.getObjectPrefix({
      key: asset.storageKey,
      maxBytes: Math.max(asset.fileSize, 1),
    })
    if (!bytes || bytes.byteLength === 0) {
      throw new Error('Knowledge file is missing from storage')
    }

    return extractKnowledgeText(document.sourceType, bytes)
  }

  async #embed(
    texts: string[],
    model: string,
    provider: LlmChatProvider,
    meta?: { organizationId: string; operationType: 'document_index' | 'document_reindex' }
  ): Promise<number[][]> {
    if (texts.length === 0) return []
    const llm = await this.#llmProvider(provider)
    const vectors: number[][] = []
    const started = Date.now()
    let totalChars = 0
    for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE)
      for (const text of batch) totalChars += text.length
      const embedded = await llm.embedTexts(batch, model)
      vectors.push(...embedded)
    }
    if (meta) {
      try {
        const promptTokens = estimateTokensFromChars(totalChars)
        await this.usage.insert({
          organizationId: meta.organizationId,
          conversationId: null,
          provider,
          operationType: meta.operationType,
          promptTokens,
          completionTokens: 0,
          totalTokens: promptTokens,
          modelName: model,
          latencyMs: Date.now() - started,
          decision:
            meta.operationType === 'document_reindex'
              ? AiUsageDecision.DOCUMENT_REINDEX
              : AiUsageDecision.DOCUMENT_INDEX,
        })
      } catch (error) {
        logger.warn(
          {
            organizationId: meta.organizationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'knowledge.embed.usage_log_failed'
        )
      }
    }
    return vectors
  }

  async #fail(
    params: { organizationId: string; documentId: string },
    message: string
  ): Promise<KnowledgeIngestResult> {
    await this.#mark(params, {
      status: AiKnowledgeDocumentStatus.FAILED,
      errorMessage: message.slice(0, MAX_ERROR_LENGTH),
    })
    return {
      documentId: params.documentId,
      status: AiKnowledgeDocumentStatus.FAILED,
      embedded: 0,
      deleted: 0,
      unchanged: 0,
      skipped: false,
    }
  }

  async #mark(
    params: { organizationId: string; documentId: string },
    patch: {
      status: AiKnowledgeDocumentStatus
      errorMessage: string | null
      documentHash?: string
      chunkCount?: number
      embeddingModel?: string
    }
  ): Promise<void> {
    await runWithTenant(params.organizationId, () =>
      this.documents.updateForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
        ...patch,
      })
    )
  }

  async #objectStorage(): Promise<ObjectStorage> {
    if (this.storage) return this.storage
    return app.container.make(ObjectStorage)
  }

  async #llmProvider(provider: LlmChatProvider): Promise<EmbeddingLlmProvider> {
    if (this.llm) return this.llm
    const factory = await app.container.make(LlmProviderFactory)
    return factory.createEmbeddingFor(provider)
  }

  async #embedDestination(): Promise<{
    embeddingProvider: LlmChatProvider
    embeddingModel: string
    embeddingSpaceId: string
  }> {
    const service = this.platform ?? (await app.container.make(PlatformAiConfigService))
    const snapshot = await service.get()
    if (
      snapshot.reindexStatus === 'running' &&
      snapshot.reindexToSpaceId &&
      snapshot.reindexEmbeddingModel &&
      snapshot.reindexEmbeddingProvider
    ) {
      return {
        embeddingProvider: snapshot.reindexEmbeddingProvider,
        embeddingModel: snapshot.reindexEmbeddingModel,
        embeddingSpaceId: snapshot.reindexToSpaceId,
      }
    }
    return {
      embeddingProvider: snapshot.embeddingProvider,
      embeddingModel: snapshot.embeddingModel,
      embeddingSpaceId: snapshot.activeEmbeddingSpaceId || DEFAULT_EMBEDDING_SPACE_ID,
    }
  }

  async reindexDocument(params: {
    organizationId: string
    documentId: string
    embeddingModel: string
    embeddingProvider: LlmChatProvider
    targetSpaceId: string
  }): Promise<KnowledgeIngestResult> {
    const document = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!document) {
      return {
        documentId: params.documentId,
        status: AiKnowledgeDocumentStatus.FAILED,
        embedded: 0,
        deleted: 0,
        unchanged: 0,
        skipped: true,
      }
    }

    if (document.deletedAt) {
      return {
        documentId: params.documentId,
        status: document.status as AiKnowledgeDocumentStatus,
        embedded: 0,
        deleted: 0,
        unchanged: 0,
        skipped: true,
      }
    }

    try {
      const text = await this.#loadText(params.organizationId, document)
      if (!text) {
        return this.#fail(params, 'Extracted text is empty')
      }

      const next = await chunkKnowledgeText(text)
      if (next.length === 0) {
        return this.#fail(params, 'No chunks produced from document text')
      }

      const documentHash = sha256Hex(text)
      const embeddings = await this.#embed(
        next.map((chunk) => chunk.content),
        params.embeddingModel,
        params.embeddingProvider,
        { organizationId: params.organizationId, operationType: 'document_reindex' }
      )

      await runWithTenant(params.organizationId, () =>
        db.transaction(async (trx) => {
          await this.chunks.deleteByDocumentSpace(
            {
              organizationId: params.organizationId,
              documentId: params.documentId,
              embeddingSpaceId: params.targetSpaceId,
            },
            trx
          )
          await this.chunks.insertMany(
            next.map((chunk, index) => ({
              organizationId: params.organizationId,
              documentId: params.documentId,
              chunkIndex: chunk.chunkIndex,
              contentHash: chunk.contentHash,
              content: chunk.content,
              embedding: embeddings[index]!,
              embeddingSpaceId: params.targetSpaceId,
              metadata: { sourceType: document.sourceType },
            })),
            trx
          )
          await this.documents.updateForOrg(
            {
              organizationId: params.organizationId,
              documentId: params.documentId,
              status: AiKnowledgeDocumentStatus.INDEXED,
              documentHash,
              chunkCount: next.length,
              embeddingModel: params.embeddingModel,
              errorMessage: null,
            },
            trx
          )
        })
      )

      return {
        documentId: params.documentId,
        status: AiKnowledgeDocumentStatus.INDEXED,
        embedded: next.length,
        deleted: 0,
        unchanged: 0,
        skipped: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Knowledge reindex failed'
      if (isUnusableKnowledgeSource(message)) {
        logger.warn(
          { organizationId: params.organizationId, documentId: params.documentId, err: message },
          'ai.reindex_document.unusable_source'
        )
        return this.#fail(params, message)
      }
      logger.error(
        { organizationId: params.organizationId, documentId: params.documentId, err: message },
        'ai.reindex_document.failed'
      )
      throw error
    }
  }
}

function isUnusableKnowledgeSource(message: string): boolean {
  return (
    /empty/i.test(message) ||
    /no chunks/i.test(message) ||
    /no media asset/i.test(message) ||
    /was not found/i.test(message) ||
    /not complete/i.test(message) ||
    /missing from storage/i.test(message)
  )
}
