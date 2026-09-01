import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import ApiKeyException from '#exceptions/api_key_exception'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { ApiKeyService } from '#services/integrations/api_key_service'
import { runWithTenant } from '#services/tenant_context'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborOwner]: FIXTURE_IDS.orgs.harbor,
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  const body = response.body() as {
    code?: string
    error?: string
    errors?: Array<{ message?: string }>
  }
  return {
    code: body.code,
    error: body.error ?? body.errors?.[0]?.message,
  }
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

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}: ${JSON.stringify(signed)}`)
  }
  return token
}

test.group('API keys HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    for (const organizationId of [FIXTURE_IDS.orgs.northstar, FIXTURE_IDS.orgs.harbor]) {
      await runWithTenant(organizationId, async () => {
        await db.from('api_keys').where('organizationId', organizationId).delete()
      })
    }
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/api-keys')
    response.assertStatus(401)
  })

  test('create returns the secret once and list omits it', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `Shopenup ${Date.now()}`

    const created = await client
      .post('/api/v1/api-keys')
      .header('Authorization', `Bearer ${token}`)
      .json({ name, scopes: ['events:write'] })
    created.assertStatus(200)

    const createdBody = created.body().data as {
      id: string
      name: string
      keyPrefix: string
      secretToken: string
      keyHash?: string
    }
    assert.equal(createdBody.name, name)
    assert.match(createdBody.secretToken, /^wta_live_[0-9a-f]{8}_[0-9a-f]{32}$/)
    assert.equal(createdBody.keyPrefix, createdBody.secretToken.slice(0, 'wta_live_'.length + 8))
    assert.isUndefined(createdBody.keyHash)

    const listed = await client.get('/api/v1/api-keys').header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const rows = listed.body().data as Array<{ id: string; secretToken?: string; keyHash?: string }>
    const listedKey = rows.find((row) => row.id === createdBody.id)
    assert.isDefined(listedKey)
    assert.isUndefined(listedKey?.secretToken)
    assert.isUndefined(listedKey?.keyHash)
  })

  test('viewer cannot manage API keys', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)

    const list = await client.get('/api/v1/api-keys').header('Authorization', `Bearer ${token}`)
    list.assertStatus(403)
    assert.equal(errorBody(list).error, 'Access denied')

    const create = await client
      .post('/api/v1/api-keys')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Blocked' })
    create.assertStatus(403)
    assert.equal(errorBody(create).error, 'Access denied')
  })

  test('other organization cannot see keys', async ({ client, assert }) => {
    const northstar = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/api-keys')
      .header('Authorization', `Bearer ${northstar}`)
      .json({ name: `NS ${Date.now()}` })
    created.assertStatus(200)
    const keyId = created.body().data.id as string

    const harbor = await mintDemoToken(DEMO_USERS.harborOwner)
    const listed = await client.get('/api/v1/api-keys').header('Authorization', `Bearer ${harbor}`)
    listed.assertStatus(200)
    const rows = listed.body().data as Array<{ id: string }>
    assert.isFalse(rows.some((row) => row.id === keyId))

    const revoke = await client
      .post(`/api/v1/api-keys/${keyId}/revoke`)
      .header('Authorization', `Bearer ${harbor}`)
    revoke.assertStatus(404)
  })

  test('revoke rejects the secret on later resolve', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/api-keys')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: `Revoke ${Date.now()}` })
    created.assertStatus(200)
    const secretToken = created.body().data.secretToken as string
    const keyId = created.body().data.id as string

    await new ApiKeyService().resolve(secretToken)

    const revoked = await client
      .post(`/api/v1/api-keys/${keyId}/revoke`)
      .header('Authorization', `Bearer ${token}`)
    revoked.assertStatus(200)
    assert.isNotNull(revoked.body().data.revokedAt)
    assert.isUndefined(revoked.body().data.secretToken)

    try {
      await new ApiKeyService().resolve(secretToken)
      assert.fail('expected revoked key to be rejected')
    } catch (error) {
      assert.instanceOf(error, ApiKeyException)
      assert.equal((error as ApiKeyException).status, 401)
      assert.equal((error as ApiKeyException).code, 'E_API_KEY_INVALID')
    }
  })
})
