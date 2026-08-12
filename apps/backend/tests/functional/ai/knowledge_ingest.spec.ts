import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import { AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { AiKnowledgeDocumentRepository } from '#repositories/ai_knowledge_document_repository'
import { MediaAssetRepository } from '#repositories/media_asset_repository'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import { OrganizationStorageObjectRepository } from '#repositories/organization_storage_object_repository'
import KnowledgeDocumentService from '#services/ai/knowledge_document_service'
import KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import { chunkKnowledgeText } from '#services/ai/chunk_knowledge_text'
import SignatureContentInspection from '#services/content_inspection/drivers/signature_content_inspection'
import { MediaAssetService } from '#services/media_asset_service'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'
import { StorageQuotaService } from '#services/storage_quota_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `kb-ingest-${id.slice(0, 8)}`
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

function createMedia(storage: FakeObjectStorage) {
  return new MediaAssetService(
    new MediaAssetRepository(),
    new OrganizationStorageObjectRepository(),
    new StorageQuotaService(),
    new MediaAssetReferenceRepository(),
    storage,
    new SignatureContentInspection()
  )
}

async function createTxtDocument(params: {
  organizationId: string
  storage: FakeObjectStorage
  title: string
  text: string
}) {
  const docs = new KnowledgeDocumentService(
    new AiKnowledgeDocumentRepository(),
    createMedia(params.storage)
  )
  const body = Buffer.from(params.text)
  const created = await docs.create({
    organizationId: params.organizationId,
    actorUserId: randomUUID(),
    title: params.title,
    sourceType: AiKnowledgeSourceType.FILE_TXT,
    fileName: `${params.title.toLowerCase().replace(/\s+/g, '-')}.txt`,
    mimeType: 'text/plain',
    fileSize: body.byteLength,
  })

  const key = params.storage.presigned[0]!.key
  params.storage.putObject(key, body, 'text/plain')
  await docs.completeUpload({
    organizationId: params.organizationId,
    documentId: created.document.id,
  })

  return created
}

test.group('Knowledge ingest', () => {
  test('indexes new chunks, skips unchanged re-ingest, and embeds only changed hashes', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const llm = new FakeLlmProvider()
    const ingest = new KnowledgeIngestService(
      new AiKnowledgeDocumentRepository(),
      new AiKnowledgeChunkRepository(),
      new MediaAssetRepository(),
      storage,
      llm
    )

    const firstWords = Array.from({ length: 800 }, (_, i) => `alpha${i}`).join(' ')
    const created = await createTxtDocument({
      organizationId,
      storage,
      title: 'Policy',
      text: firstWords,
    })

    const first = await ingest.process({
      organizationId,
      documentId: created.document.id,
    })
    const firstChunks = await chunkKnowledgeText(firstWords)
    assert.equal(first.status, AiKnowledgeDocumentStatus.INDEXED)
    assert.equal(first.embedded, firstChunks.length)
    assert.equal(llm.embedCalls.length, firstChunks.length)

    const again = await ingest.process({
      organizationId,
      documentId: created.document.id,
    })
    assert.isTrue(again.skipped)
    assert.equal(again.embedded, 0)
    assert.equal(llm.embedCalls.length, firstChunks.length)

    const changed = `${firstWords} extra closing paragraph about returns.`
    const asset = await runWithTenant(organizationId, () =>
      new MediaAssetRepository().findByIdForOrg({
        organizationId,
        mediaAssetId: created.document.mediaAssetId!,
      })
    )
    storage.putObject(asset!.storageKey, Buffer.from(changed), 'text/plain')
    await runWithTenant(organizationId, () =>
      db
        .from('media_assets')
        .where('id', asset!.id)
        .update({ fileSize: Buffer.byteLength(changed) })
    )

    const second = await ingest.process({
      organizationId,
      documentId: created.document.id,
    })
    const secondChunks = await chunkKnowledgeText(changed)
    assert.equal(second.status, AiKnowledgeDocumentStatus.INDEXED)
    assert.isAbove(second.embedded, 0)
    assert.isBelow(second.embedded, secondChunks.length)
    assert.equal(llm.embedCalls.length, firstChunks.length + second.embedded)

    const stored = await runWithTenant(organizationId, () =>
      db
        .from('ai_knowledge_chunks')
        .where('documentId', created.document.id)
        .count('* as total')
        .first()
    )
    assert.equal(Number(stored?.total ?? 0), secondChunks.length)
  })

  test('marks ingest FAILED when the file is missing', async ({ assert }) => {
    const organizationId = await createOrg()
    const storage = new FakeObjectStorage()
    const llm = new FakeLlmProvider()
    const created = await createTxtDocument({
      organizationId,
      storage,
      title: 'Missing',
      text: 'Open 9-5',
    })
    storage.objects.clear()

    const result = await new KnowledgeIngestService(
      new AiKnowledgeDocumentRepository(),
      new AiKnowledgeChunkRepository(),
      new MediaAssetRepository(),
      storage,
      llm
    ).process({
      organizationId,
      documentId: created.document.id,
    })

    assert.equal(result.status, AiKnowledgeDocumentStatus.FAILED)
    assert.lengthOf(llm.embedCalls, 0)
  })
})
