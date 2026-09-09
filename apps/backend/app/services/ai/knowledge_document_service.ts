import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import type { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import KnowledgeDocumentException from '#exceptions/knowledge_document_exception'
import PlanRestrictionException from '#exceptions/plan_restriction_exception'
import { StorageNamespace } from '#lib/media/storage_types'
import { normalizeMimeType } from '#lib/meta_whatsapp/outbound_media'
import { AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import {
  mimeTypeForKnowledgeSource,
  KNOWLEDGE_CREATE_SOURCE_TYPES,
} from '#services/ai/knowledge_source_mime'
import { MediaAssetService } from '#services/media_asset_service'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'
import {
  transformKnowledgeDocument,
  type KnowledgeDocumentResponse,
} from '#transformers/knowledge_document_transformer'
import type { PresignedUpload } from '#services/object_storage/contracts/object_storage'

export type CreateKnowledgeDocumentInput = {
  organizationId: string
  actorUserId: string
  title: string
  sourceType: AiKnowledgeSourceType
  fileName: string
  mimeType: string
  fileSize: number
}

export type CreateKnowledgeDocumentResult = {
  document: KnowledgeDocumentResponse
  upload: PresignedUpload
}

export type KnowledgeDocumentListResult = {
  data: KnowledgeDocumentResponse[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export default class KnowledgeDocumentService {
  constructor(
    private documents: AiKnowledgeDocumentRepository = new AiKnowledgeDocumentRepository(),
    private media: MediaAssetService = new MediaAssetService()
  ) {}

  async list(params: {
    organizationId: string
    page?: number
    perPage?: number
    status?: string
    lifecycle?: 'active' | 'deleted'
  }): Promise<KnowledgeDocumentListResult> {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20

    const { rows, total } = await runWithTenant(params.organizationId, () =>
      this.documents.listForOrg({
        organizationId: params.organizationId,
        page,
        perPage,
        status: params.status,
        lifecycle: params.lifecycle ?? 'active',
      })
    )

    return {
      data: rows.map(transformKnowledgeDocument),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }

  async get(params: {
    organizationId: string
    documentId: string
  }): Promise<KnowledgeDocumentResponse> {
    const row = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!row) {
      throw KnowledgeDocumentException.notFound()
    }
    return transformKnowledgeDocument(row)
  }

  async create(input: CreateKnowledgeDocumentInput): Promise<CreateKnowledgeDocumentResult> {
    const supported = KNOWLEDGE_CREATE_SOURCE_TYPES as readonly AiKnowledgeSourceType[]
    if (!supported.includes(input.sourceType)) {
      throw KnowledgeDocumentException.sourceUnsupported(input.sourceType)
    }

    if (!input.fileName || !input.mimeType || !input.fileSize) {
      throw KnowledgeDocumentException.invalidCreate(
        'fileName, mimeType, and fileSize are required'
      )
    }

    const expectedMime = mimeTypeForKnowledgeSource(input.sourceType)
    const mimeType = normalizeMimeType(input.mimeType)
    if (!expectedMime || mimeType !== expectedMime) {
      throw KnowledgeDocumentException.invalidCreate(
        `mimeType must be ${expectedMime} for ${input.sourceType}`
      )
    }

    const enforcement = new PlanEnforcementService()
    const docCountRow = await runWithTenant(input.organizationId, () =>
      db
        .from('ai_knowledge_documents')
        .where('organizationId', input.organizationId)
        .whereNull('deletedAt')
        .count('* as total')
        .first()
    )
    await enforcement.requireUnderLimit(
      input.organizationId,
      'maxKnowledgeDocs',
      Number(docCountRow?.total ?? 0)
    )

    const maxSizeMb = await enforcement.getNumericLimit(
      input.organizationId,
      'maxKnowledgeDocSizeMb'
    )
    if (maxSizeMb !== null) {
      const maxBytes = maxSizeMb * 1024 * 1024
      if (input.fileSize > maxBytes) {
        throw PlanRestrictionException.sizeLimitExceeded(
          'maxKnowledgeDocSizeMb',
          input.fileSize,
          maxBytes
        )
      }
    }

    const initiated = await this.media.initiateUpload({
      organizationId: input.organizationId,
      uploadedBy: input.actorUserId,
      fileName: input.fileName,
      mimeType,
      fileSize: input.fileSize,
      namespace: StorageNamespace.KnowledgeBase,
    })

    const document = await runWithTenant(input.organizationId, () =>
      this.documents.insert({
        id: randomUUID(),
        organizationId: input.organizationId,
        title: input.title,
        sourceType: input.sourceType,
        status: AiKnowledgeDocumentStatus.PENDING,
        mediaAssetId: initiated.asset.id,
      })
    )

    return {
      document: transformKnowledgeDocument(document),
      upload: initiated.upload,
    }
  }

  async completeUpload(params: {
    organizationId: string
    documentId: string
  }): Promise<KnowledgeDocumentResponse> {
    const row = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!row) {
      throw KnowledgeDocumentException.notFound()
    }
    if (row.deletedAt) {
      throw KnowledgeDocumentException.alreadyDeleted()
    }
    if (!row.mediaAssetId) {
      throw KnowledgeDocumentException.invalidCreate('Document has no file to complete')
    }

    await this.media.completeUpload({
      organizationId: params.organizationId,
      mediaAssetId: row.mediaAssetId,
    })

    await this.#enqueueIngest({
      organizationId: params.organizationId,
      documentId: row.id,
      mediaAssetId: row.mediaAssetId,
      sourceType: row.sourceType,
      isUpdate: Boolean(row.documentHash) || row.status === AiKnowledgeDocumentStatus.INDEXED,
    })

    return transformKnowledgeDocument(row)
  }

  /**
   * Soft-delete a KB document. Linked ready media is soft-deleted via MediaAssetService
   * (quota retained until purge). Chunks remain until permanent purge; retrieval excludes
   * soft-deleted docs.
   */
  async softDelete(params: {
    organizationId: string
    documentId: string
  }): Promise<KnowledgeDocumentResponse> {
    const row = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!row) {
      throw KnowledgeDocumentException.notFound()
    }
    if (row.deletedAt) {
      throw KnowledgeDocumentException.alreadyDeleted()
    }

    const updated = await runWithTenant(params.organizationId, () =>
      this.documents.markSoftDeleted({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!updated) {
      throw KnowledgeDocumentException.notFound()
    }

    if (row.mediaAssetId) {
      try {
        await this.media.softDelete({
          organizationId: params.organizationId,
          mediaAssetId: row.mediaAssetId,
        })
      } catch {
        // Pending uploads are reaped by the existing media orphan cleaner.
      }
    }

    return transformKnowledgeDocument(updated)
  }

  async restore(params: {
    organizationId: string
    documentId: string
  }): Promise<KnowledgeDocumentResponse> {
    const row = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!row) {
      throw KnowledgeDocumentException.notFound()
    }
    if (!row.deletedAt) {
      throw KnowledgeDocumentException.notRestorable()
    }

    const updated = await runWithTenant(params.organizationId, () =>
      this.documents.markRestored({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!updated) {
      throw KnowledgeDocumentException.notRestorable()
    }

    if (row.mediaAssetId) {
      try {
        await this.media.restore({
          organizationId: params.organizationId,
          mediaAssetId: row.mediaAssetId,
        })
      } catch {
        // Media may already be ready, pending, or purged by the lifecycle worker.
      }
    }

    return transformKnowledgeDocument(updated)
  }

  /** Permanently remove a soft-deleted document (chunks cascade) and purge linked media. */
  async purge(params: { organizationId: string; documentId: string }): Promise<void> {
    const row = await runWithTenant(params.organizationId, () =>
      this.documents.findByIdForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!row) {
      throw KnowledgeDocumentException.notFound()
    }
    if (!row.deletedAt) {
      throw KnowledgeDocumentException.notPurgeable()
    }

    const deleted = await runWithTenant(params.organizationId, () =>
      this.documents.deleteForOrg({
        organizationId: params.organizationId,
        documentId: params.documentId,
      })
    )
    if (!deleted) {
      throw KnowledgeDocumentException.notFound()
    }

    if (row.mediaAssetId) {
      try {
        await this.media.purge({
          organizationId: params.organizationId,
          mediaAssetId: row.mediaAssetId,
        })
      } catch {
        // Storage may already be purged by the media lifecycle worker.
      }
    }
  }

  async #enqueueIngest(params: {
    organizationId: string
    documentId: string
    mediaAssetId: string | null
    sourceType: string
    isUpdate: boolean
  }): Promise<void> {
    try {
      const manager = await app.container.make(JobQueueManager)
      const queue = await manager.ensureStarted()
      await queue.enqueue(
        JOB_NAMES.AI_PROCESS_DOCUMENT,
        {
          organizationId: params.organizationId,
          documentId: params.documentId,
          mediaAssetId: params.mediaAssetId ?? undefined,
          sourceType: params.sourceType,
          isUpdate: params.isUpdate,
        },
        { singletonKey: params.documentId }
      )
    } catch (error) {
      logger.error(
        {
          documentId: params.documentId,
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'ai.process_document.enqueue_failed'
      )
    }
  }
}
