import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import { AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import { MediaAssetRepository } from '#repositories/media_asset_repository'
import { chunkKnowledgeText } from '#services/ai/chunk_knowledge_text'
import { LlmProvider } from '#services/ai/contracts/llm_provider'
import { extractKnowledgeText } from '#services/ai/extract_knowledge_text'
import { sha256Hex } from '#services/ai/knowledge_hash'
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
    private llm?: LlmProvider,
    private platform?: PlatformAiConfigService
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

      const existing = await runWithTenant(params.organizationId, () =>
        this.chunks.listHashesForDocument(params)
      )
      const plan = planChunkSync(existing, next)
      const { embeddingModel } = await this.#platformConfig()
      const embeddings = await this.#embed(
        plan.toInsert.map((chunk) => chunk.content),
        embeddingModel
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
              embeddingModel,
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
    if (
      document.sourceType === AiKnowledgeSourceType.FAQ_LIST ||
      document.sourceType === AiKnowledgeSourceType.WEB_URL
    ) {
      throw new Error(`Source type ${document.sourceType} is not supported yet`)
    }
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

  async #embed(texts: string[], model: string): Promise<number[][]> {
    if (texts.length === 0) return []
    const llm = await this.#llmProvider()
    const vectors: number[][] = []
    for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE)
      const embedded = await llm.embedTexts(batch, model)
      vectors.push(...embedded)
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

  async #llmProvider(): Promise<LlmProvider> {
    if (this.llm) return this.llm
    return app.container.make(LlmProvider)
  }

  async #platformConfig(): Promise<{ embeddingModel: string }> {
    const service = this.platform ?? (await app.container.make(PlatformAiConfigService))
    return service.get()
  }
}
