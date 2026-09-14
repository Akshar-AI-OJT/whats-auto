import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { jsonb } from '#database/demo/helpers'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

type OrganizationRow = {
  id: string
  name: string
  slug: string
  email: string
  country?: string
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

async function insertLifecycleOrg(params: {
  runId: string
  suffix: string
  status: string
  deletedAt?: Date | null
}): Promise<string> {
  const id = randomUUID()
  const slug = `bug013-${params.runId}-${params.suffix}`
  await db.table('organizations').insert({
    id,
    name: `Bug013 ${params.suffix} ${params.runId}`,
    slug,
    email: `${slug}@example.com`,
    industry: 'Retail',
    businessSize: '1-10',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: params.status,
    deletedAt: params.deletedAt ?? null,
    address: jsonb({
      addressLine1: '1 Lifecycle Lane',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'IN',
    }),
  })
  return id
}

async function orgDbRow(organizationId: string) {
  return db
    .from('organizations')
    .where('id', organizationId)
    .select('id', 'name', 'slug', 'email', 'country', 'status', 'deletedAt')
    .first()
}

test.group('BUG-013 Super Admin organization suspend and activate', (group) => {
  const createdOrgIds: string[] = []
  const runId = randomUUID().replace(/-/g, '').slice(0, 8)

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    if (createdOrgIds.length === 0) return
    await db.from('authorization_audits').whereIn('organizationId', createdOrgIds).delete()
    await db.from('organizations').whereIn('id', createdOrgIds).delete()
  })

  test('active organization suspends to persisted status suspended without deletedAt', async ({
    client,
    assert,
  }) => {
    const organizationId = await insertLifecycleOrg({
      runId,
      suffix: 'active',
      status: OrganizationStatus.ACTIVE,
    })
    createdOrgIds.push(organizationId)

    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/suspend`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = unwrapOrganization(response.body())
    assert.exists(body)
    assert.equal(body!.status, OrganizationStatus.SUSPENDED)
    assert.isNull(body!.deletedAt ?? null)

    const row = await orgDbRow(organizationId)
    assert.equal(row?.status, OrganizationStatus.SUSPENDED)
    assert.isNull(row?.deletedAt ?? null)
  })

  test('suspended organization activates to persisted status active', async ({
    client,
    assert,
  }) => {
    const organizationId = await insertLifecycleOrg({
      runId,
      suffix: 'suspended',
      status: OrganizationStatus.SUSPENDED,
    })
    createdOrgIds.push(organizationId)

    const before = await orgDbRow(organizationId)
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/activate`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = unwrapOrganization(response.body())
    assert.exists(body)
    assert.equal(body!.status, OrganizationStatus.ACTIVE)
    assert.isNull(body!.deletedAt ?? null)

    const after = await orgDbRow(organizationId)
    assert.equal(after?.status, OrganizationStatus.ACTIVE)
    assert.isNull(after?.deletedAt ?? null)
    assert.equal(after?.name, before?.name)
    assert.equal(after?.slug, before?.slug)
    assert.equal(after?.email, before?.email)
    assert.equal(after?.country, before?.country)
  })

  test('GET after suspend and activate returns the persisted DB status', async ({
    client,
    assert,
  }) => {
    const organizationId = await insertLifecycleOrg({
      runId,
      suffix: 'reload',
      status: OrganizationStatus.ACTIVE,
    })
    createdOrgIds.push(organizationId)

    const token = await mintToken(DEMO_USERS.superadmin)
    const suspended = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/suspend`)
      .header('Authorization', `Bearer ${token}`)
    suspended.assertStatus(200)

    const afterSuspend = await client
      .get(`/api/v1/super-admin/organizations/${organizationId}`)
      .header('Authorization', `Bearer ${token}`)
    afterSuspend.assertStatus(200)
    assert.equal(unwrapOrganization(afterSuspend.body())!.status, OrganizationStatus.SUSPENDED)

    const activated = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/activate`)
      .header('Authorization', `Bearer ${token}`)
    activated.assertStatus(200)

    const afterActivate = await client
      .get(`/api/v1/super-admin/organizations/${organizationId}`)
      .header('Authorization', `Bearer ${token}`)
    afterActivate.assertStatus(200)
    assert.equal(unwrapOrganization(afterActivate.body())!.status, OrganizationStatus.ACTIVE)

    const row = await orgDbRow(organizationId)
    assert.equal(row?.status, OrganizationStatus.ACTIVE)
    assert.isNull(row?.deletedAt ?? null)
  })

  test('archived organization cannot be suspended or activated', async ({ client, assert }) => {
    const organizationId = await insertLifecycleOrg({
      runId,
      suffix: 'archived',
      status: OrganizationStatus.FALSE,
      deletedAt: new Date(),
    })
    createdOrgIds.push(organizationId)

    const token = await mintToken(DEMO_USERS.superadmin)
    const suspend = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/suspend`)
      .header('Authorization', `Bearer ${token}`)
    suspend.assertStatus(409)
    assert.equal(errorBody(suspend).code, 'E_ORGANIZATION_ARCHIVED')

    const activate = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/activate`)
      .header('Authorization', `Bearer ${token}`)
    activate.assertStatus(409)
    assert.equal(errorBody(activate).code, 'E_ORGANIZATION_ARCHIVED')

    const row = await orgDbRow(organizationId)
    assert.equal(row?.status, OrganizationStatus.FALSE)
    assert.isNotNull(row?.deletedAt ?? null)
  })

  test('tenant admin cannot suspend or activate an organization', async ({ client }) => {
    const organizationId = await insertLifecycleOrg({
      runId,
      suffix: 'idor',
      status: OrganizationStatus.ACTIVE,
    })
    createdOrgIds.push(organizationId)

    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const suspend = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/suspend`)
      .header('Authorization', `Bearer ${token}`)
    suspend.assertStatus(403)

    const activate = await client
      .post(`/api/v1/super-admin/organizations/${organizationId}/activate`)
      .header('Authorization', `Bearer ${token}`)
    activate.assertStatus(403)
  })

  test('unauthenticated callers receive 401', async ({ client }) => {
    const organizationId = randomUUID()
    const suspend = await client.post(`/api/v1/super-admin/organizations/${organizationId}/suspend`)
    suspend.assertStatus(401)
    const activate = await client.post(
      `/api/v1/super-admin/organizations/${organizationId}/activate`
    )
    activate.assertStatus(401)
  })

  test('nonexistent organization returns 404 and invalid id returns 422', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const missing = await client
      .post(`/api/v1/super-admin/organizations/${randomUUID()}/suspend`)
      .header('Authorization', `Bearer ${token}`)
    missing.assertStatus(404)
    assert.equal(errorBody(missing).code, 'E_ORGANIZATION_NOT_FOUND')

    const invalid = await client
      .post('/api/v1/super-admin/organizations/not-a-uuid/activate')
      .header('Authorization', `Bearer ${token}`)
    invalid.assertStatus(422)
  })
})
