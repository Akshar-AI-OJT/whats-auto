import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_ORGS, DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

type OrganizationRow = {
  id: string
  name: string
  slug: string
  email: string
  status?: string
  deletedAt?: string | null
}

function unwrapOrganization(body: unknown): OrganizationRow | null {
  if (!body || typeof body !== 'object') return null

  const root = body as { data?: OrganizationRow } & OrganizationRow
  if (root.data && typeof root.data === 'object' && typeof root.data.id === 'string') {
    return root.data
  }
  if (typeof root.id === 'string') return root
  return null
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function mintToken(email: string, activeOrgId?: string): Promise<string> {
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

  if (activeOrgId) {
    await db
      .from('sessions')
      .where('id', sessionRow.id)
      .update({ activeOrganizationId: activeOrgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: activeOrgId ?? null },
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

test.group('Super Admin Organizations GET by id', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('superadmin can get an existing organization by id', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.northstar}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const org = unwrapOrganization(response.body())
    assert.exists(org)
    assert.equal(org!.id, FIXTURE_IDS.orgs.northstar)
    assert.equal(org!.name, DEMO_ORGS.northstar.name)
    assert.equal(org!.slug, DEMO_ORGS.northstar.slug)
    assert.equal(org!.email, DEMO_ORGS.northstar.email)
    assert.notEqual(org!.id, FIXTURE_IDS.orgs.harbor)
  })

  test('response is a single organization, not a paginated list', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.harbor}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as { data?: unknown; meta?: unknown }
    assert.isFalse(Array.isArray(body))
    assert.isFalse(Array.isArray(body.data))
    const org = unwrapOrganization(body)
    assert.exists(org)
    assert.equal(org!.id, FIXTURE_IDS.orgs.harbor)
    assert.equal(org!.name, DEMO_ORGS.harbor.name)
    assert.equal(org!.slug, DEMO_ORGS.harbor.slug)
  })

  test('returns 404 for a nonexistent organization id', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const missingId = randomUUID()
    const response = await client
      .get(`/api/v1/super-admin/organizations/${missingId}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_ORGANIZATION_NOT_FOUND')
    assert.isNull(unwrapOrganization(response.body()))
  })

  test('rejects unauthenticated GET', async ({ client }) => {
    const response = await client.get(
      `/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.northstar}`
    )
    response.assertStatus(401)
  })

  test('tenant owner cannot access another organization via Super Admin GET', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.harbor}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
    assert.isNull(unwrapOrganization(response.body()))
  })

  test('organization admin cannot access Super Admin GET by id', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.northstar}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
  })

  test('does not depend on the superadmin active organization', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin, FIXTURE_IDS.orgs.harbor)
    const response = await client
      .get(`/api/v1/super-admin/organizations/${FIXTURE_IDS.orgs.northstar}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const org = unwrapOrganization(response.body())
    assert.equal(org?.id, FIXTURE_IDS.orgs.northstar)
    assert.notEqual(org?.id, FIXTURE_IDS.orgs.harbor)
  })

  test('rejects an invalid organization id', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/organizations/not-a-uuid')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)
  })
})
