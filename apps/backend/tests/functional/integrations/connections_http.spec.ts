import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { encryptIntegrationSecret } from '#lib/integrations/secret_crypto'
import { IntegrationConnectionRepository } from '#repositories/integration_connection_repository'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
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

test.group('Integration connections HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.setup(async () => {
    for (const organizationId of [FIXTURE_IDS.orgs.northstar, FIXTURE_IDS.orgs.harbor]) {
      await runWithTenant(organizationId, async () => {
        await db.from('integration_connections').where('organizationId', organizationId).delete()
      })
    }
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/integrations')
    response.assertStatus(401)
  })

  test('PUT shopenup returns a redacted row and second PUT updates the same id', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)

    const created = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
      .json({
        displayName: 'Shopenup Production',
        externalAccountId: 'store_1',
        config: { storeUrl: 'https://shop.example.com' },
      })
    created.assertStatus(200)

    const createdBody = created.body().data as {
      id: string
      provider: string
      displayName: string
      encryptedSecret?: string
      config: Record<string, unknown>
    }
    assert.equal(createdBody.provider, 'shopenup')
    assert.equal(createdBody.displayName, 'Shopenup Production')
    assert.deepEqual(createdBody.config, { storeUrl: 'https://shop.example.com' })
    assert.isUndefined(createdBody.encryptedSecret)
    assert.notInclude(JSON.stringify(created.body()), 'encryptedSecret')

    const updated = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
      .json({ displayName: 'Shopenup Staging' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.id, createdBody.id)
    assert.equal(updated.body().data.displayName, 'Shopenup Staging')
    assert.isUndefined(updated.body().data.encryptedSecret)

    const listed = await client
      .get('/api/v1/integrations')
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const rows = listed.body().data as Array<{ id: string; encryptedSecret?: string }>
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, createdBody.id)
    assert.isUndefined(rows[0].encryptedSecret)
  })

  test('GET omits stored secrets', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const plaintext = `plain-secret-${Date.now()}`

    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await new IntegrationConnectionRepository().upsertForOrg({
        organizationId: FIXTURE_IDS.orgs.northstar,
        provider: 'shopenup',
        displayName: 'Hidden secret',
        encryptedSecret: encryptIntegrationSecret(plaintext),
      })
    })

    const shown = await client
      .get('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    assert.isUndefined(shown.body().data.encryptedSecret)
    assert.notInclude(JSON.stringify(shown.body()), plaintext)
    assert.notInclude(JSON.stringify(shown.body()), 'encryptedSecret')
  })

  test('PUT shopify is rejected', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .put('/api/v1/integrations/shopify')
      .header('Authorization', `Bearer ${token}`)
      .json({ displayName: 'Shopify Store' })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_INTEGRATION_PROVIDER_UNSUPPORTED')
  })

  test('PUT rejects secret keys in config', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
      .json({
        displayName: 'Shopenup',
        config: { apiKey: 'should-not-land' },
      })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_INTEGRATION_CONFIG_SECRET')
  })

  test('viewer cannot manage connections', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)

    const list = await client.get('/api/v1/integrations').header('Authorization', `Bearer ${token}`)
    list.assertStatus(403)
    assert.equal(errorBody(list).error, 'Access denied')

    const upsert = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
      .json({ displayName: 'Blocked' })
    upsert.assertStatus(403)
    assert.equal(errorBody(upsert).error, 'Access denied')
  })

  test('other organization cannot see the connection', async ({ client, assert }) => {
    const northstar = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${northstar}`)
      .json({ displayName: 'Northstar shop' })
    created.assertStatus(200)
    const connectionId = created.body().data.id as string

    const harbor = await mintDemoToken(DEMO_USERS.harborOwner)
    const listed = await client
      .get('/api/v1/integrations')
      .header('Authorization', `Bearer ${harbor}`)
    listed.assertStatus(200)
    const rows = listed.body().data as Array<{ id: string }>
    assert.isFalse(rows.some((row) => row.id === connectionId))

    const shown = await client
      .get('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${harbor}`)
    shown.assertStatus(404)
    assert.equal(errorBody(shown).code, 'E_INTEGRATION_CONNECTION_NOT_FOUND')
  })

  test('DELETE removes the shopenup connection', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .put('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
      .json({ displayName: 'To delete' })
    created.assertStatus(200)

    const deleted = await client
      .delete('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(200)
    assert.isTrue(deleted.body().data.ok)

    const shown = await client
      .get('/api/v1/integrations/shopenup')
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(404)
    assert.equal(errorBody(shown).code, 'E_INTEGRATION_CONNECTION_NOT_FOUND')
  })
})
