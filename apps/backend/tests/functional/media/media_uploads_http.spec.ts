import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { MediaAssetState } from '#lib/media/types'
import { MEDIA_UPLOAD_PRESIGN_SECONDS } from '#services/media_asset_service'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import { createObjectStorageFromEnv } from '#services/object_storage/create_object_storage_from_env'
import FakeObjectStorage from '#services/object_storage/drivers/fake_object_storage'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborAgent]: FIXTURE_IDS.orgs.harbor,
}

function jpegBytes(size: number): Buffer {
  const buf = Buffer.alloc(Math.max(size, 3))
  buf[0] = 0xff
  buf[1] = 0xd8
  buf[2] = 0xff
  return buf.subarray(0, size)
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function mintDemoToken(email: string): Promise<string> {
  let result: { token?: string; user?: { id: string; name: string; email: string } }
  try {
    result = (await auth.api.signInEmail({
      body: { email, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }
  } catch (error) {
    throw new Error(
      `Failed to sign in ${email}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}: ${JSON.stringify(result)}`)
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

  try {
    const signed = await auth.api.signJWT({
      body: { payload: payload as Record<string, any> },
    })
    const token = (signed as { token?: string } | null)?.token
    if (!token) {
      throw new Error(`signJWT returned no token for ${email}: ${JSON.stringify(signed)}`)
    }
    return token
  } catch (error) {
    throw new Error(
      `Failed to mint token for ${email}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

test.group('Media uploads HTTP', (group) => {
  let storage: FakeObjectStorage

  group.setup(async () => {
    // Stale JWKS rows encrypted under an old BETTER_AUTH_SECRET break signJWT.
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    storage = new FakeObjectStorage()
    app.container.bindValue(ObjectStorage, storage)
  })

  group.teardown(() => {
    app.container.bindValue(ObjectStorage, createObjectStorageFromEnv())
  })

  group.each.setup(() => {
    storage.objects.clear()
    storage.presigned.length = 0
    storage.deletedKeys.length = 0
  })

  test('rejects unauthenticated initiate', async ({ client }) => {
    const response = await client.post('/api/v1/media/uploads').json({
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      fileSize: 12,
    })
    response.assertStatus(401)
  })

  test('rejects viewer without media:upload', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)
    const response = await client
      .post('/api/v1/media/uploads')
      .header('Authorization', `Bearer ${token}`)
      .json({
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12,
      })

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PERMISSION_DENIED')
  })

  test('agent initiates, completes after put, and complete is idempotent', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAgent)
    const fileSize = 16

    const initiate = await client
      .post('/api/v1/media/uploads')
      .header('Authorization', `Bearer ${token}`)
      .json({
        fileName: 'banner.jpg',
        mimeType: 'image/jpeg',
        fileSize,
      })

    initiate.assertStatus(200)
    const initiated = initiate.body().data as {
      asset: { id: string; state: string; deliveryUrl: string }
      upload: { method: string; expiresInSeconds: number; url: string }
    }

    assert.equal(initiated.asset.state, MediaAssetState.PendingUpload)
    assert.equal(initiated.upload.method, 'PUT')
    assert.equal(initiated.upload.expiresInSeconds, MEDIA_UPLOAD_PRESIGN_SECONDS)
    assert.include(initiated.asset.deliveryUrl, 'media.test.local')
    assert.lengthOf(storage.presigned, 1)

    const key = storage.presigned[0]!.key
    storage.putObject(key, jpegBytes(fileSize), 'image/jpeg')

    const complete = await client
      .post(`/api/v1/media/uploads/${initiated.asset.id}/complete`)
      .header('Authorization', `Bearer ${token}`)

    complete.assertStatus(200)
    assert.equal(complete.body().data.state, MediaAssetState.Ready)
    assert.equal(complete.body().data.id, initiated.asset.id)

    const again = await client
      .post(`/api/v1/media/uploads/${initiated.asset.id}/complete`)
      .header('Authorization', `Bearer ${token}`)

    again.assertStatus(200)
    assert.equal(again.body().data.state, MediaAssetState.Ready)
  })

  test('complete without object returns upload incomplete', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAgent)

    const initiate = await client
      .post('/api/v1/media/uploads')
      .header('Authorization', `Bearer ${token}`)
      .json({
        fileName: 'missing.jpg',
        mimeType: 'image/jpeg',
        fileSize: 8,
      })

    initiate.assertStatus(200)
    const assetId = initiate.body().data.asset.id as string

    const complete = await client
      .post(`/api/v1/media/uploads/${assetId}/complete`)
      .header('Authorization', `Bearer ${token}`)

    complete.assertStatus(422)
    assert.equal(errorBody(complete).code, 'E_MEDIA_UPLOAD_INCOMPLETE')
  })

  test('complete rejects size mismatch', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAgent)
    const declaredSize = 20

    const initiate = await client
      .post('/api/v1/media/uploads')
      .header('Authorization', `Bearer ${token}`)
      .json({
        fileName: 'mismatch.jpg',
        mimeType: 'image/jpeg',
        fileSize: declaredSize,
      })

    initiate.assertStatus(200)
    const assetId = initiate.body().data.asset.id as string
    storage.putObject(storage.presigned.at(-1)!.key, jpegBytes(4), 'image/jpeg')

    const complete = await client
      .post(`/api/v1/media/uploads/${assetId}/complete`)
      .header('Authorization', `Bearer ${token}`)

    complete.assertStatus(422)
    assert.equal(errorBody(complete).code, 'E_MEDIA_UPLOAD_MISMATCH')
  })

  test('isolates tenants on complete', async ({ client, assert }) => {
    const northstar = await mintDemoToken(DEMO_USERS.northstarAgent)
    const harbor = await mintDemoToken(DEMO_USERS.harborAgent)

    const initiate = await client
      .post('/api/v1/media/uploads')
      .header('Authorization', `Bearer ${northstar}`)
      .json({
        fileName: 'private.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
      })

    initiate.assertStatus(200)
    const assetId = initiate.body().data.asset.id as string

    const complete = await client
      .post(`/api/v1/media/uploads/${assetId}/complete`)
      .header('Authorization', `Bearer ${harbor}`)

    complete.assertStatus(404)
    assert.equal(errorBody(complete).code, 'E_MEDIA_NOT_FOUND')
  })
})
