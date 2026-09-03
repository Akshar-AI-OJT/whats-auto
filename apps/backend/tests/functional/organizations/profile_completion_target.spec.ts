import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

type ProfileSnapshot = {
  id: string
  name: string
  email: string
  industry: string | null
  businessSize: string | null
  country: string
  address: unknown
  description: string | null
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

function uniqueSlug(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function createOrgPayload(name: string, slug: string) {
  return {
    name,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    organizationType: 'company' as const,
    address: '99 Market Street, Austin',
    country: 'US',
    timezone: 'America/Chicago',
    industry: 'Technology',
  }
}

const ORG_B_PROFILE_PATCH = {
  name: 'Organization B Profile',
  industry: 'Healthcare',
  businessSize: '201-500',
  country: 'US',
  description: 'Created-org profile completion values',
  address: {
    addressLine1: '500 Congress Ave',
    city: 'Austin',
    state: 'Texas',
    postalCode: '78701',
  },
}

const ORG_A_EDIT_PATCH = {
  name: 'Northstar Home Goods Edited',
}

async function mintTokenForOrg(email: string, organizationId: string): Promise<string> {
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

  await db
    .from('sessions')
    .where('id', sessionRow.id)
    .update({ activeOrganizationId: organizationId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: organizationId },
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

async function snapshotOrganization(organizationId: string): Promise<ProfileSnapshot> {
  return db
    .from('organizations')
    .where('id', organizationId)
    .whereNull('deletedAt')
    .select(
      'id',
      'name',
      'email',
      'industry',
      'businessSize',
      'country',
      'address',
      'description'
    )
    .firstOrFail()
}

function unwrapCreatedId(body: { data?: { id?: string }; id?: string }): string {
  const organizationId = body.data?.id ?? body.id
  if (!organizationId) {
    throw new Error(`Create organization response missing id: ${JSON.stringify(body)}`)
  }
  return organizationId
}

test.group('Organization profile completion targets the created organization', (group) => {
  const orgIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await db.from('user_roles').where('organizationId', organizationId).delete()
        await runWithTenant(organizationId, async () => {
          await db.from('organizations').where('id', organizationId).delete()
        })
      }
    }
  })

  test('creating org B and completing its profile does not change existing org A', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const slug = uniqueSlug('profile-b')
    const created = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(createOrgPayload('Organization B Draft', slug))

    created.assertStatus(200)
    const body = created.body() as {
      data?: { id: string; sessionActivated?: boolean }
      id?: string
      sessionActivated?: boolean
    }
    const organizationBId = unwrapCreatedId(body)
    orgIds.push(organizationBId)
    assert.notEqual(organizationBId, organizationAId)
    assert.isFalse(body.data?.sessionActivated ?? body.sessionActivated ?? false)

    const afterCreateA = await snapshotOrganization(organizationAId)
    assert.deepEqual(afterCreateA, originalA)

    const tokenForB = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationBId)
    const saved = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${tokenForB}`)
      .json(ORG_B_PROFILE_PATCH)
    saved.assertStatus(200)

    const updatedB = await snapshotOrganization(organizationBId)
    const unchangedA = await snapshotOrganization(organizationAId)

    assert.equal(updatedB.name, ORG_B_PROFILE_PATCH.name)
    assert.equal(updatedB.industry, ORG_B_PROFILE_PATCH.industry)
    assert.equal(updatedB.businessSize, ORG_B_PROFILE_PATCH.businessSize)
    assert.equal(updatedB.country, ORG_B_PROFILE_PATCH.country)
    assert.equal(updatedB.description, ORG_B_PROFILE_PATCH.description)
    assert.deepEqual(unchangedA, originalA)
  })

  test('profile update for B succeeds only after the session is set-active on B', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const slug = uniqueSlug('auth-b')
    const created = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(createOrgPayload('Auth Organization B', slug))
    created.assertStatus(200)
    const organizationBId = unwrapCreatedId(
      created.body() as { data?: { id: string }; id?: string }
    )
    orgIds.push(organizationBId)

    const originalB = await snapshotOrganization(organizationBId)

    const rejected = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(ORG_B_PROFILE_PATCH)
    rejected.assertStatus(403)
    assert.equal(errorBody(rejected).code, 'PERMISSION_DENIED')

    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
    assert.deepEqual(await snapshotOrganization(organizationBId), originalB)

    const setActive = await client
      .post(`/api/v1/organizations/${organizationBId}/set-active`)
      .header('Authorization', `Bearer ${tokenForA}`)
    setActive.assertStatus(200)

    const tokenForB = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationBId)
    const saved = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${tokenForB}`)
      .json(ORG_B_PROFILE_PATCH)
    saved.assertStatus(200)

    const updatedB = await snapshotOrganization(organizationBId)
    assert.equal(updatedB.name, ORG_B_PROFILE_PATCH.name)
    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
  })

  test('normal profile editing still updates the existing organization', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const saved = await client
      .patch(`/api/v1/organizations/${organizationAId}`)
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(ORG_A_EDIT_PATCH)
    saved.assertStatus(200)

    try {
      const updatedA = await snapshotOrganization(organizationAId)
      assert.equal(updatedA.name, ORG_A_EDIT_PATCH.name)
      assert.equal(updatedA.industry, originalA.industry)
      assert.equal(updatedA.email, originalA.email)
    } finally {
      await db.from('organizations').where('id', organizationAId).update({ name: originalA.name })
    }
  })

  test('PATCH of A is rejected while the session is scoped to newly created B', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const slug = uniqueSlug('wrong-target')
    const created = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(createOrgPayload('Wrong Target Org B', slug))
    created.assertStatus(200)
    const organizationBId = unwrapCreatedId(
      created.body() as { data?: { id: string }; id?: string }
    )
    orgIds.push(organizationBId)

    const tokenForB = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationBId)
    const rejected = await client
      .patch(`/api/v1/organizations/${organizationAId}`)
      .header('Authorization', `Bearer ${tokenForB}`)
      .json({ name: 'Should Not Touch Organization A' })
    rejected.assertStatus(403)
    assert.equal(errorBody(rejected).code, 'PERMISSION_DENIED')
    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
  })

  test('member of A can complete B after set-active, and A stays unchanged', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarAgent, organizationAId)

    const slug = uniqueSlug('member-b')
    const created = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(createOrgPayload('Member Created Org B', slug))
    created.assertStatus(200)
    const organizationBId = unwrapCreatedId(
      created.body() as { data?: { id: string }; id?: string }
    )
    orgIds.push(organizationBId)

    const rejected = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(ORG_B_PROFILE_PATCH)
    rejected.assertStatus(403)

    const tokenForB = await mintTokenForOrg(DEMO_USERS.northstarAgent, organizationBId)
    const saved = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${tokenForB}`)
      .json(ORG_B_PROFILE_PATCH)
    saved.assertStatus(200)

    assert.equal((await snapshotOrganization(organizationBId)).name, ORG_B_PROFILE_PATCH.name)
    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
  })

  test('profile completion still updates B after a fresh token mint (refresh)', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const slug = uniqueSlug('refresh-b')
    const created = await client
      .post('/api/v1/organizations')
      .header('Authorization', `Bearer ${tokenForA}`)
      .json(createOrgPayload('Refresh Organization B', slug))
    created.assertStatus(200)
    const organizationBId = unwrapCreatedId(
      created.body() as { data?: { id: string }; id?: string }
    )
    orgIds.push(organizationBId)

    const setActive = await client
      .post(`/api/v1/organizations/${organizationBId}/set-active`)
      .header('Authorization', `Bearer ${tokenForA}`)
    setActive.assertStatus(200)

    const refreshedTokenForB = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationBId)
    const saved = await client
      .patch(`/api/v1/organizations/${organizationBId}`)
      .header('Authorization', `Bearer ${refreshedTokenForB}`)
      .json(ORG_B_PROFILE_PATCH)
    saved.assertStatus(200)

    assert.equal((await snapshotOrganization(organizationBId)).name, ORG_B_PROFILE_PATCH.name)
    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
  })

  test('PATCH of an unrelated organization id is rejected and leaves A unchanged', async ({
    client,
    assert,
  }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const foreignOrgId = FIXTURE_IDS.orgs.harbor
    const originalA = await snapshotOrganization(organizationAId)
    const originalForeign = await snapshotOrganization(foreignOrgId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)

    const rejected = await client
      .patch(`/api/v1/organizations/${foreignOrgId}`)
      .header('Authorization', `Bearer ${tokenForA}`)
      .json({ name: 'Should Not Touch Harbor' })
    rejected.assertStatus(403)
    assert.equal(errorBody(rejected).code, 'PERMISSION_DENIED')

    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
    assert.deepEqual(await snapshotOrganization(foreignOrgId), originalForeign)
  })

  test('PATCH of a random organization id is rejected', async ({ client, assert }) => {
    const organizationAId = FIXTURE_IDS.orgs.northstar
    const originalA = await snapshotOrganization(organizationAId)
    const tokenForA = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationAId)
    const arbitraryId = randomUUID()

    const rejected = await client
      .patch(`/api/v1/organizations/${arbitraryId}`)
      .header('Authorization', `Bearer ${tokenForA}`)
      .json({ name: 'Arbitrary Organization' })
    rejected.assertStatus(403)
    assert.equal(errorBody(rejected).code, 'PERMISSION_DENIED')
    assert.deepEqual(await snapshotOrganization(organizationAId), originalA)
  })
})
