import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
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

async function createIncompleteActiveOrgOwnedBy(userId: string) {
  const organizationId = randomUUID()
  const slug = `incomplete-${organizationId.slice(0, 8)}`
  const ownerRoleId = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', 'owner')
    .select('id')
    .firstOrFail()

  await db.table('organizations').insert({
    id: organizationId,
    name: `Incomplete ${slug}`,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: OrganizationStatus.ACTIVE,
  })

  await db.table('organization_members').insert({
    organizationId,
    userId,
    roleId: ownerRoleId.id,
  })

  await db.table('user_roles').insert({
    userId,
    roleId: ownerRoleId.id,
    organizationId,
  })

  return organizationId
}

const COMPLETE_PROFILE_PATCH = {
  industry: 'Retail',
  businessSize: '11-50',
  country: 'IN',
  address: {
    addressLine1: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
  },
}

test.group('Organization profile completion gate', (group) => {
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

  test('protected API returns 403 E_ORGANIZATION_PROFILE_INCOMPLETE when profile is incomplete', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')
  })

  test('frontend bypass: calling a protected API directly still returns 403', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .get('/api/v1/campaigns')
      .header('Authorization', `Bearer ${token}`)
      .header('X-Requested-With', 'XMLHttpRequest')

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')
  })

  test('profile update remains allowed while the organization profile is incomplete', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .patch(`/api/v1/organizations/${organizationId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Incomplete Renamed' })

    response.assertStatus(200)
    const body = response.body() as { data?: { name?: string }; name?: string }
    assert.equal(body.data?.name ?? body.name, 'Incomplete Renamed')
  })

  test('access-context, org list, and billing remain reachable before completion', async ({
    client,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const auth = { Authorization: `Bearer ${token}` }

    const accessContext = await client.get('/api/v1/access-context').headers(auth)
    accessContext.assertStatus(200)

    const orgs = await client.get('/api/v1/organizations').headers(auth)
    orgs.assertStatus(200)

    const billing = await client.get('/api/v1/billing/plans').headers(auth)
    billing.assertStatus(200)
  })

  test('SMTP and invitations are blocked until the profile is complete', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)

    const smtp = await client
      .get(`/api/v1/organizations/${organizationId}/smtp`)
      .header('Authorization', `Bearer ${token}`)
    smtp.assertStatus(403)
    assert.equal(errorBody(smtp).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')

    const invite = await client
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'agent@example.com', role: 'agent' })
    invite.assertStatus(403)
    assert.equal(errorBody(invite).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')
  })

  test('completed profile can access protected APIs normally', async ({ client, assert }) => {
    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.isDefined(response.body())
  })

  test('completing the profile via PATCH unblocks protected APIs', async ({ client, assert }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)

    const before = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)
    before.assertStatus(403)
    assert.equal(errorBody(before).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')

    const saved = await client
      .patch(`/api/v1/organizations/${organizationId}`)
      .header('Authorization', `Bearer ${token}`)
      .json(COMPLETE_PROFILE_PATCH)
    saved.assertStatus(200)

    const after = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)
    after.assertStatus(200)
  })

  test('gate uses the authenticated tenant org and ignores a different organizationId', async ({
    client,
    assert,
  }) => {
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    const organizationId = await createIncompleteActiveOrgOwnedBy(owner.id as string)
    orgIds.push(organizationId)

    const token = await mintTokenForOrg(DEMO_USERS.northstarOwner, organizationId)
    const completeOrgId = FIXTURE_IDS.orgs.northstar

    const contacts = await client
      .get('/api/v1/contacts')
      .qs({ organizationId: completeOrgId })
      .header('Authorization', `Bearer ${token}`)
    contacts.assertStatus(403)
    assert.equal(errorBody(contacts).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')

    const spoofedCreate = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({
        organizationId: completeOrgId,
        phoneNumber: '+14155552671',
        name: 'Bypass',
      })
    spoofedCreate.assertStatus(403)
    assert.equal(errorBody(spoofedCreate).code, 'E_ORGANIZATION_PROFILE_INCOMPLETE')
  })
})
