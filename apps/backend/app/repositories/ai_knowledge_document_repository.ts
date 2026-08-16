import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import type { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

export type AiKnowledgeDocumentRow = {
  id: string
  organizationId: string
  mediaAssetId: string | null
  title: string
  sourceType: string
  status: string
  chunkCount: number
  embeddingModel: string
  documentHash: string | null
  errorMessage: string | null
  deletedAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertKnowledgeDocumentParams = {
  id: string
  organizationId: string
  title: string
  sourceType: AiKnowledgeSourceType
  status: AiKnowledgeDocumentStatus
  mediaAssetId: string | null
  embeddingModel?: string
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped ai_knowledge_documents. Callers must run inside runWithTenant.
 */
export class AiKnowledgeDocumentRepository {
  async insert(
    params: InsertKnowledgeDocumentParams,
    client: Db = db
  ): Promise<AiKnowledgeDocumentRow> {
    const [row] = await client
      .table('ai_knowledge_documents')
      .insert({
        id: params.id,
        organizationId: params.organizationId,
        title: params.title,
        sourceType: params.sourceType,
        status: params.status,
        mediaAssetId: params.mediaAssetId,
        embeddingModel: params.embeddingModel ?? 'text-embedding-3-small',
        chunkCount: 0,
      })
      .returning('*')

    return mapRow(row)
  }

  async findByIdForOrg(
    params: { organizationId: string; documentId: string },
    client: Db = db
  ): Promise<AiKnowledgeDocumentRow | null> {
    const row = await client
      .from('ai_knowledge_documents')
      .where('id', params.documentId)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapRow(row) : null
  }

  async deleteForOrg(
    params: { organizationId: string; documentId: string },
    client: Db = db
  ): Promise<boolean> {
    const deleted = await client
      .from('ai_knowledge_documents')
      .where('id', params.documentId)
      .where('organizationId', params.organizationId)
      .delete()
    return Number(deleted) > 0
  }

  async markSoftDeleted(
    params: { organizationId: string; documentId: string; deletedAt?: Date },
    client: Db = db
  ): Promise<AiKnowledgeDocumentRow | null> {
    const [row] = await client
      .from('ai_knowledge_documents')
      .where('id', params.documentId)
      .where('organizationId', params.organizationId)
      .whereNull('deletedAt')
      .update({ deletedAt: params.deletedAt ?? new Date() })
      .returning('*')
    return row ? mapRow(row) : null
  }

  async markRestored(
    params: { organizationId: string; documentId: string },
    client: Db = db
  ): Promise<AiKnowledgeDocumentRow | null> {
    const [row] = await client
      .from('ai_knowledge_documents')
      .where('id', params.documentId)
      .where('organizationId', params.organizationId)
      .whereNotNull('deletedAt')
      .update({ deletedAt: null })
      .returning('*')
    return row ? mapRow(row) : null
  }

  async listForOrg(params: {
    organizationId: string
    page: number
    perPage: number
    status?: string
    /** Default active (deletedAt IS NULL). Pass 'deleted' for trash. */
    lifecycle?: 'active' | 'deleted'
  }): Promise<{ rows: AiKnowledgeDocumentRow[]; total: number }> {
    const query = db.from('ai_knowledge_documents').where('organizationId', params.organizationId)

    if (params.lifecycle === 'deleted') {
      query.whereNotNull('deletedAt')
    } else {
      query.whereNull('deletedAt')
    }

    if (params.status) {
      query.where('status', params.status)
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)
    const rows = await query
      .clone()
      .orderBy('createdAt', 'desc')
      .offset((params.page - 1) * params.perPage)
      .limit(params.perPage)
      .select('*')

    return { rows: rows.map(mapRow), total }
  }

  async updateForOrg(
    params: {
      organizationId: string
      documentId: string
      status?: AiKnowledgeDocumentStatus
      documentHash?: string | null
      chunkCount?: number
      embeddingModel?: string
      errorMessage?: string | null
    },
    client: Db = db
  ): Promise<AiKnowledgeDocumentRow | null> {
    const patch: Record<string, unknown> = {}
    if (params.status !== undefined) patch.status = params.status
    if (params.documentHash !== undefined) patch.documentHash = params.documentHash
    if (params.chunkCount !== undefined) patch.chunkCount = params.chunkCount
    if (params.embeddingModel !== undefined) patch.embeddingModel = params.embeddingModel
    if (params.errorMessage !== undefined) patch.errorMessage = params.errorMessage
    if (Object.keys(patch).length === 0) {
      return this.findByIdForOrg(
        { organizationId: params.organizationId, documentId: params.documentId },
        client
      )
    }

    const [row] = await client
      .from('ai_knowledge_documents')
      .where('id', params.documentId)
      .where('organizationId', params.organizationId)
      .update(patch)
      .returning('*')

    return row ? mapRow(row) : null
  }

  /**
   * Cross-tenant INDEXED documents. FORCE RLS would hide rows without a tenant GUC.
   */
  async listIndexedForReindex(): Promise<Array<{ organizationId: string; documentId: string }>> {
    const result = await db.rawQuery('SELECT * FROM list_ai_knowledge_documents_for_reindex()')
    return mapReindexRows(result)
  }

  async listIndexedMissingSpace(
    spaceId: string
  ): Promise<Array<{ organizationId: string; documentId: string }>> {
    const result = await db.rawQuery('SELECT * FROM list_ai_knowledge_documents_missing_space(?)', [
      spaceId,
    ])
    return mapReindexRows(result)
  }
}

function mapReindexRows(result: { rows?: unknown } | unknown): Array<{
  organizationId: string
  documentId: string
}> {
  const rows = ((result as { rows?: unknown }).rows ?? result) as Array<Record<string, unknown>>
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    organizationId: String(row.organizationId),
    documentId: String(row.id),
  }))
}

function mapRow(row: Record<string, unknown>): AiKnowledgeDocumentRow {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    mediaAssetId: (row.mediaAssetId as string | null) ?? null,
    title: row.title as string,
    sourceType: row.sourceType as string,
    status: row.status as string,
    chunkCount: Number(row.chunkCount ?? 0),
    embeddingModel: row.embeddingModel as string,
    documentHash: (row.documentHash as string | null) ?? null,
    errorMessage: (row.errorMessage as string | null) ?? null,
    deletedAt: (row.deletedAt as Date | string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}
