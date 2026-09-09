import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { jsonb } from '#database/demo/helpers'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

const PAGE_LIMIT = 100
const OVER_LIMIT = 120

type TenantSummary = {
  totalContacts: number
  totalCampaigns: number
  sentCount: number
  deliveredCount: number
  deliveryRate: number
}

type PlatformSummary = {
  totalOrganizations: number
  activeOrganizations: number
  inactiveOrganizations: number
  trialOrganizations: number
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

function unwrapData<T extends object>(body: unknown, marker: keyof T): T | null {
  if (!body || typeof body !== 'object') return null
  const root = body as { data?: T } & T
  if (root.data && typeof root.data === 'object' && marker in root.data) return root.data
  if (marker in root) return root as T
  return null
}

function asCount(row: { total?: unknown } | null | undefined): number {
  return Number(row?.total ?? 0)
}

function unwrapList(body: unknown): unknown[] {
  if (!body) return []
  if (Array.isArray(body)) return body

  if (typeof body !== 'object') return []
  const root = body as {
    data?: unknown[] | { data?: unknown[] }
  }

  if (Array.isArray(root.data)) return root.data
  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return root.data.data
  }
  return []
}

test.group('BUG-012 analytics summary aggregates full dataset', (group) => {
  const contactIds: string[] = []
  const harborContactIds: string[] = []
  const campaignIds: string[] = []
  const extraOrgIds: string[] = []
  const emptyOrgIds: string[] = []
  const runId = randomUUID().replace(/-/g, '').slice(0, 8)

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      const contactRows = Array.from({ length: OVER_LIMIT }, (_, index) => {
        const phone = `1555${runId}${String(index).padStart(4, '0')}`
        return {
          organizationId: FIXTURE_IDS.orgs.northstar,
          phone,
          phoneNormalized: phone,
          name: `Bug012 Contact ${index}`,
          customFields: jsonb({}),
          createdByUserId: FIXTURE_IDS.users.northstarOwner,
        }
      })
      const insertedContacts = await db.table('contacts').insert(contactRows).returning(['id'])
      contactIds.push(...insertedContacts.map((row) => row.id as string))

      const campaignRows = Array.from({ length: OVER_LIMIT }, (_, index) => ({
        organizationId: FIXTURE_IDS.orgs.northstar,
        createdByUserId: FIXTURE_IDS.users.northstarOwner,
        name: `Bug012 Campaign ${runId} ${index}`,
        status: 'draft',
        sentCount: 2,
        deliveredCount: 1,
        totalRecipients: 2,
      }))
      const inserted = await db.table('broadcasts').insert(campaignRows).returning(['id'])
      campaignIds.push(...inserted.map((row) => row.id as string))
    })

    await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      const insertedHarbor = await db
        .table('contacts')
        .insert({
          organizationId: FIXTURE_IDS.orgs.harbor,
          phone: `1556${runId}0000`,
          phoneNormalized: `1556${runId}0000`,
          name: 'Bug012 Harbor Contact',
          customFields: jsonb({}),
          createdByUserId: FIXTURE_IDS.users.harborOwner,
        })
        .returning(['id'])
      harborContactIds.push(...insertedHarbor.map((row) => row.id as string))
    })

    const orgRows = Array.from({ length: OVER_LIMIT }, (_, index) => {
      const id = randomUUID()
      extraOrgIds.push(id)
      return {
        id,
        name: `Bug012 Org ${runId} ${index}`,
        slug: `bug012-${runId}-${index}`,
        email: `bug012-${runId}-${index}@example.com`,
        country: 'US',
        timezone: 'UTC',
        currency: 'USD',
        status: 'active',
      }
    })
    await db.table('organizations').insert(orgRows)
  })

  group.teardown(async () => {
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      if (campaignIds.length > 0) {
        await db.from('broadcasts').whereIn('id', campaignIds).delete()
      }
      if (contactIds.length > 0) {
        await db.from('contacts').whereIn('id', contactIds).delete()
      }
    })
    await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      if (harborContactIds.length > 0) {
        await db.from('contacts').whereIn('id', harborContactIds).delete()
      }
    })
    if (extraOrgIds.length > 0) {
      await db.from('organizations').whereIn('id', extraOrgIds).delete()
    }
    for (const organizationId of emptyOrgIds) {
      await db.from('user_roles').where('organizationId', organizationId).delete()
      await db.from('organization_members').where('organizationId', organizationId).delete()
      await runWithTenant(organizationId, async () => {
        await db.from('organizations').where('id', organizationId).delete()
      })
    }
  })

  test('organization contact KPI counts the full dataset beyond the list page limit', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const [summaryResponse, listResponse] = await Promise.all([
      client.get('/api/v1/analytics/summary').header('Authorization', `Bearer ${token}`),
      client
        .get(`/api/v1/contacts?page=1&perPage=${PAGE_LIMIT}`)
        .header('Authorization', `Bearer ${token}`),
    ])

    summaryResponse.assertStatus(200)
    listResponse.assertStatus(200)

    const summary = unwrapData<TenantSummary>(summaryResponse.body(), 'totalContacts')
    assert.isNotNull(summary)
    const listed = unwrapList(listResponse.body())
    const contactTotalRow = await runWithTenant(FIXTURE_IDS.orgs.northstar, () =>
      db
        .from('contacts')
        .where('organizationId', FIXTURE_IDS.orgs.northstar)
        .whereNull('deletedAt')
        .count('* as total')
        .first()
    )
    const dbCount = asCount(contactTotalRow)

    assert.equal(summary!.totalContacts, dbCount)
    assert.isAbove(summary!.totalContacts, PAGE_LIMIT)
    assert.equal(listed.length, PAGE_LIMIT)
    assert.isBelow(listed.length, summary!.totalContacts)
  })

  test('organization campaign KPI sums the full dataset not the first page', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const [response, listResponse] = await Promise.all([
      client.get('/api/v1/analytics/summary').header('Authorization', `Bearer ${token}`),
      client
        .get(`/api/v1/campaigns?page=1&perPage=${PAGE_LIMIT}`)
        .header('Authorization', `Bearer ${token}`),
    ])

    response.assertStatus(200)
    listResponse.assertStatus(200)
    const summary = unwrapData<TenantSummary>(response.body(), 'totalCampaigns')
    assert.isNotNull(summary)
    const listed = unwrapList(listResponse.body())

    const dbRow = await runWithTenant(FIXTURE_IDS.orgs.northstar, () =>
      db
        .from('broadcasts')
        .where('organizationId', FIXTURE_IDS.orgs.northstar)
        .whereNot('status', 'deleted')
        .select(
          db.raw('COUNT(*)::int as total'),
          db.raw('COALESCE(SUM("sentCount"),0)::int as sent'),
          db.raw('COALESCE(SUM("deliveredCount"),0)::int as delivered')
        )
        .first()
    )

    assert.equal(summary!.totalCampaigns, Number(dbRow?.total ?? 0))
    assert.isAbove(summary!.totalCampaigns, PAGE_LIMIT)
    assert.equal(listed.length, PAGE_LIMIT)
    assert.isBelow(listed.length, summary!.totalCampaigns)
    assert.equal(summary!.sentCount, Number(dbRow?.sent ?? 0))
    assert.equal(summary!.deliveredCount, Number(dbRow?.delivered ?? 0))
    assert.equal(
      summary!.deliveryRate,
      Math.round((summary!.deliveredCount / summary!.sentCount) * 1000) / 10
    )
  })

  test('organization analytics remains isolated to the active organization', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/analytics/summary?organizationId=${FIXTURE_IDS.orgs.harbor}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const summary = unwrapData<TenantSummary>(response.body(), 'totalContacts')
    assert.isNotNull(summary)

    const northstarRow = await runWithTenant(FIXTURE_IDS.orgs.northstar, () =>
      db
        .from('contacts')
        .where('organizationId', FIXTURE_IDS.orgs.northstar)
        .whereNull('deletedAt')
        .count('* as total')
        .first()
    )
    const harborRow = await runWithTenant(FIXTURE_IDS.orgs.harbor, () =>
      db
        .from('contacts')
        .where('organizationId', FIXTURE_IDS.orgs.harbor)
        .whereNull('deletedAt')
        .count('* as total')
        .first()
    )
    const northstarCount = asCount(northstarRow)
    const harborCount = asCount(harborRow)

    assert.equal(summary!.totalContacts, northstarCount)
    assert.notEqual(summary!.totalContacts, northstarCount + harborCount)
    assert.isAbove(harborCount, 0)
  })

  test('empty organization returns zero KPI values', async ({ client, assert }) => {
    const ownerRole = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'owner')
      .select('id')
      .firstOrFail()
    const organizationId = randomUUID()
    emptyOrgIds.push(organizationId)
    await db.table('organizations').insert({
      id: organizationId,
      name: `Bug012 Empty ${runId}`,
      slug: `bug012-empty-${runId}`,
      email: `bug012-empty-${runId}@example.com`,
      industry: 'Retail',
      businessSize: '1-10',
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: 'active',
      address: jsonb({
        addressLine1: '1 Empty Lane',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'IN',
      }),
    })
    await db.table('organization_members').insert({
      organizationId,
      userId: FIXTURE_IDS.users.northstarOwner,
      roleId: ownerRole.id,
    })
    await db.table('user_roles').insert({
      userId: FIXTURE_IDS.users.northstarOwner,
      roleId: ownerRole.id,
      organizationId,
    })

    const token = await mintToken(DEMO_USERS.northstarOwner, organizationId)
    const response = await client
      .get('/api/v1/analytics/summary')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const summary = unwrapData<TenantSummary>(response.body(), 'totalContacts')
    assert.isNotNull(summary)
    assert.equal(summary!.totalContacts, 0)
    assert.equal(summary!.totalCampaigns, 0)
    assert.equal(summary!.sentCount, 0)
    assert.equal(summary!.deliveredCount, 0)
    assert.equal(summary!.deliveryRate, 0)
  })

  test('tenant without analytics:view cannot read the summary', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAgent, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/analytics/summary')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(403)
  })

  test('super admin organization KPI counts the full dataset beyond the list page limit', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const [summaryResponse, listResponse] = await Promise.all([
      client
        .get('/api/v1/super-admin/analytics/summary')
        .header('Authorization', `Bearer ${token}`),
      client
        .get(`/api/v1/super-admin/organizations?page=1&perPage=${PAGE_LIMIT}`)
        .header('Authorization', `Bearer ${token}`),
    ])

    summaryResponse.assertStatus(200)
    listResponse.assertStatus(200)

    const summary = unwrapData<PlatformSummary>(summaryResponse.body(), 'totalOrganizations')
    assert.isNotNull(summary)
    const listed = unwrapList(listResponse.body())
    const orgTotalRow = await db.from('organizations').count('* as total').first()
    const dbCount = asCount(orgTotalRow)

    assert.equal(summary!.totalOrganizations, dbCount)
    assert.isAbove(summary!.totalOrganizations, PAGE_LIMIT)
    assert.equal(listed.length, PAGE_LIMIT)
    assert.isBelow(listed.length, summary!.totalOrganizations)
    assert.isAtLeast(summary!.activeOrganizations, OVER_LIMIT)
  })

  test('super admin analytics requires platform authorization', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/analytics/summary')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(403)
  })

  test('unauthenticated callers cannot read analytics summaries', async ({ client }) => {
    const tenant = await client.get('/api/v1/analytics/summary')
    tenant.assertStatus(401)
    const platform = await client.get('/api/v1/super-admin/analytics/summary')
    platform.assertStatus(401)
  })
})
