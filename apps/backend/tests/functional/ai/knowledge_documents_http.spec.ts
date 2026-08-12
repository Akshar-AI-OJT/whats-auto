import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import { createObjectStorageFromEnv } from '#services/object_storage/create_object_storage_from_env'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import type NullJobQueueDriver from '#services/job_queue/drivers/null_driver'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborAdmin]: FIXTURE_IDS.orgs.harbor,
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

function pdfBytes(size: number): Buffer {
  const buf = Buffer.alloc(Math.max(size, 5))
  buf.write('%PDF-', 0)
  return buf.subarray(0, size)
}

async function mintDemoToken(email: string): Promise<string> {
  const result = (await auth.api.signInEmail({
    body: { email, password: DEMO_PASSWORD },
  })) as { token?: string; user?: { id: string; name: string; email: string } }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}`)
  }

  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) {
    throw new Error(`No session row after sign-in for ${email}`)
  }

  const orgId = ACTIVE_ORG_BY_EMAIL[email]
  if (!orgId) {
    throw new Error(`No active org mapping for ${email}`)
  }
  await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

test.group('Knowledge documents HTTP', (group) => {
  let storage: FakeObjectStorage
  let queue: NullJobQueueDriver

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    storage = new FakeObjectStorage()
    app.container.bindValue(ObjectStorage, storage)
    const manager = await app.container.make(JobQueueManager)
    queue = (await manager.ensureStarted()) as NullJobQueueDriver
  })

  group.teardown(() => {
    app.container.bindValue(ObjectStorage, createObjectStorageFromEnv())
  })

  group.each.setup(() => {
    storage.objects.clear()
    storage.presigned.length = 0
    storage.deletedKeys.length = 0
    queue.clearEnqueued()
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/ai/knowledge-documents')
    response.assertStatus(401)
  })

  test('rejects viewer without ai:kb_manage', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)
    const response = await client
      .post('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
      .json({
        title: 'Hours',
        sourceType: 'FILE_TXT',
        fileName: 'hours.txt',
        mimeType: 'text/plain',
        fileSize: 12,
      })

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PERMISSION_DENIED')
  })

  test('rejects agent create (view only)', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAgent)
    const response = await client
      .post('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
      .json({
        title: 'Hours',
        sourceType: 'FILE_TXT',
        fileName: 'hours.txt',
        mimeType: 'text/plain',
        fileSize: 12,
      })

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PERMISSION_DENIED')
  })

  test('owner uploads FILE_TXT as PENDING and hides it from the media library', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const body = Buffer.from('Open 9-5 Monday to Friday.')
    const create = await client
      .post('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
      .json({
        title: 'Store hours',
        sourceType: 'FILE_TXT',
        fileName: 'store-hours.txt',
        mimeType: 'text/plain',
        fileSize: body.byteLength,
      })

    create.assertStatus(200)
    const created = create.body().data as {
      document: { id: string; status: string; sourceType: string; mediaAssetId: string }
      upload: { method: string; url: string }
    }
    assert.equal(created.document.status, 'PENDING')
    assert.equal(created.document.sourceType, 'FILE_TXT')
    assert.equal(created.upload.method, 'PUT')
    assert.lengthOf(storage.presigned, 1)

    storage.putObject(storage.presigned[0]!.key, body, 'text/plain')

    const complete = await client
      .post(`/api/v1/ai/knowledge-documents/${created.document.id}/complete-upload`)
      .header('Authorization', `Bearer ${token}`)
    complete.assertStatus(200)
    assert.equal(queue.enqueued[0]?.name, JOB_NAMES.AI_PROCESS_DOCUMENT)
    assert.equal(queue.enqueued[0]?.data.documentId, created.document.id)

    const show = await client
      .get(`/api/v1/ai/knowledge-documents/${created.document.id}`)
      .header('Authorization', `Bearer ${token}`)
    show.assertStatus(200)
    assert.equal(show.body().data.id, created.document.id)

    const list = await client
      .get('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
    list.assertStatus(200)
    const listed = list.body().data as { data: Array<{ id: string }>; meta: { total: number } }
    assert.isTrue(listed.data.some((row) => row.id === created.document.id))

    const library = await client.get('/api/v1/media').header('Authorization', `Bearer ${token}`)
    library.assertStatus(200)
    const libraryRows = library.body().data as { data: Array<{ id: string }> }
    assert.isFalse(libraryRows.data.some((row) => row.id === created.document.mediaAssetId))

    const harbor = await mintDemoToken(DEMO_USERS.harborAdmin)
    const isolated = await client
      .get(`/api/v1/ai/knowledge-documents/${created.document.id}`)
      .header('Authorization', `Bearer ${harbor}`)
    isolated.assertStatus(404)
    assert.equal(errorBody(isolated).code, 'E_KNOWLEDGE_DOCUMENT_NOT_FOUND')

    const destroy = await client
      .delete(`/api/v1/ai/knowledge-documents/${created.document.id}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(200)

    const gone = await client
      .get(`/api/v1/ai/knowledge-documents/${created.document.id}`)
      .header('Authorization', `Bearer ${token}`)
    gone.assertStatus(404)
  })

  test('admin initiates a PDF upload into the knowledge_base namespace', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAdmin)
    const fileSize = 24

    const create = await client
      .post('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
      .json({
        title: 'Return policy',
        sourceType: 'FILE_PDF',
        fileName: 'returns.pdf',
        mimeType: 'application/pdf',
        fileSize,
      })

    create.assertStatus(200)
    const created = create.body().data as {
      document: { id: string; status: string }
      upload: { method: string; url: string }
    }
    assert.equal(created.document.status, 'PENDING')
    assert.equal(created.upload.method, 'PUT')
    assert.lengthOf(storage.presigned, 1)
    assert.include(storage.presigned[0]!.key, '/knowledge-base/')

    storage.putObject(storage.presigned[0]!.key, pdfBytes(fileSize), 'application/pdf')

    const complete = await client
      .post(`/api/v1/ai/knowledge-documents/${created.document.id}/complete-upload`)
      .header('Authorization', `Bearer ${token}`)
    complete.assertStatus(200)
    assert.equal(complete.body().data.status, 'PENDING')
  })

  test('unknown sourceType is rejected by validation', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .post('/api/v1/ai/knowledge-documents')
      .header('Authorization', `Bearer ${token}`)
      .json({
        title: 'FAQ',
        sourceType: 'FAQ_LIST',
      })

    response.assertStatus(422)
  })
})
