import { test } from '@japa/runner'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import type { AiKnowledgeDocumentRow } from '#repositories/ai_knowledge_document_repository'
import { type AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import { type AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { type MediaAssetRepository } from '#repositories/media_asset_repository'
import type { MediaAssetRow } from '#repositories/media_asset_repository'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import { sha256Hex } from '#services/ai/knowledge_hash'
import KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'

const ORG = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'
const ASSET = '33333333-3333-4333-8333-333333333333'

function documentRow(overrides: Partial<AiKnowledgeDocumentRow> = {}): AiKnowledgeDocumentRow {
  return {
    id: DOC,
    organizationId: ORG,
    mediaAssetId: ASSET,
    title: 'Hours',
    sourceType: AiKnowledgeSourceType.MANUAL_TEXT,
    status: AiKnowledgeDocumentStatus.PENDING,
    chunkCount: 0,
    embeddingModel: 'text-embedding-3-small',
    documentHash: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  }
}

function assetRow(): MediaAssetRow {
  return {
    id: ASSET,
    organizationId: ORG,
    fileName: 'hours.txt',
    filePath: 'x',
    deliveryUrl: 'https://media.test/hours.txt',
    storageKey: 'organizations/org/knowledge-base/documents/hours.txt',
    storageDisk: 's3',
    storageObjectId: '44444444-4444-4444-8444-444444444444',
    state: 'ready',
    source: 'upload',
    mimeType: 'text/plain',
    fileSize: 12,
    checksum: null,
    uploadedBy: null,
    uploadedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function createIngest(params: {
  document?: AiKnowledgeDocumentRow | null
  asset?: MediaAssetRow | null
  text?: string
}) {
  const row = params.document
  const documents = {
    async findByIdForOrg() {
      return row ?? null
    },
    async updateForOrg(patch: Partial<AiKnowledgeDocumentRow>) {
      if (!row) return null
      Object.assign(row, patch)
      return row
    },
  } as unknown as AiKnowledgeDocumentRepository

  const chunks = {
    async listHashesForDocument() {
      return []
    },
  } as unknown as AiKnowledgeChunkRepository

  const body = params.text !== undefined ? Buffer.from(params.text) : null
  const mediaAssets = {
    async findByIdForOrg() {
      if (params.asset !== undefined) return params.asset
      const asset = assetRow()
      if (body) asset.fileSize = body.byteLength
      return asset
    },
  } as unknown as MediaAssetRepository

  const storage = new FakeObjectStorage()
  if (body) {
    storage.putObject(assetRow().storageKey, body, 'text/plain')
  }

  const llm = new FakeLlmProvider()
  const platform = {
    async get() {
      return { embeddingModel: 'text-embedding-3-small' }
    },
  } as unknown as PlatformAiConfigService

  return {
    llm,
    row,
    service: new KnowledgeIngestService(documents, chunks, mediaAssets, storage, llm, platform),
  }
}

test.group('KnowledgeIngestService', () => {
  test('skips a missing document without embedding', async ({ assert }) => {
    const { service, llm } = createIngest({ document: null })
    const result = await service.process({ organizationId: ORG, documentId: DOC })
    assert.isTrue(result.skipped)
    assert.lengthOf(llm.embedCalls, 0)
  })

  test('marks empty extracted text as FAILED', async ({ assert }) => {
    const row = documentRow()
    const { service, llm } = createIngest({ document: row, text: '   ' })
    const result = await service.process({ organizationId: ORG, documentId: DOC })
    assert.equal(result.status, AiKnowledgeDocumentStatus.FAILED)
    assert.match(row.errorMessage ?? '', /empty/i)
    assert.lengthOf(llm.embedCalls, 0)
  })

  test('short-circuits when the document hash is unchanged', async ({ assert }) => {
    const text = 'Open 9-5 Monday to Friday.'
    const row = documentRow({
      documentHash: sha256Hex(text),
      chunkCount: 1,
      status: AiKnowledgeDocumentStatus.INDEXED,
    })
    const { service, llm } = createIngest({ document: row, text })
    const result = await service.process({ organizationId: ORG, documentId: DOC })

    assert.isTrue(result.skipped)
    assert.equal(result.status, AiKnowledgeDocumentStatus.INDEXED)
    assert.equal(result.embedded, 0)
    assert.lengthOf(llm.embedCalls, 0)
  })
})
