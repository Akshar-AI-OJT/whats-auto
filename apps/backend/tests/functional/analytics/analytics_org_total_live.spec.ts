import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { jsonb } from '#database/demo/helpers'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { unwrapListEnvelope } from '#tests/helpers/list_envelope'

type PlatformSummary = {
  totalOrganizations: number
  activeOrganizations: number
  inactiveOrganizations: number
  trialOrganizations: number
}

type OrganizationListItem = {
  id: string
  status?: string
  deletedAt?: string | Date | null
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
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
    body: { payload: payload as Record<string, unknown> },
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

function unwrapList(body: unknown): { items: OrganizationListItem[]; meta: PaginationMeta | null } {
  return unwrapListEnvelope<OrganizationListItem>(body)
}

function asCount(row: { total?: unknown } | null | undefined): number {
  return Number(row?.total ?? 0)
}

async function liveOrganizationCount(): Promise<number> {
  const row = await db.from('organizations').whereNull('deletedAt').count('* as total').first()
  return asCount(row)
}

async function allOrganizationCount(): Promise<number> {
  const row = await db.from('organizations').count('* as total').first()
  return asCount(row)
}

test.group('BUG-019 Super Admin live organization totals', (group) => {
  const createdOrgIds: string[] = []
  const runId = randomUUID().replace(/-/g, '').slice(0, 8)

  group.tap((t) => t.timeout(30_000))

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    if (createdOrgIds.length === 0) return
    await db.from('authorization_audits').whereIn('organizationId', createdOrgIds).delete()
    await db.from('organizations').whereIn('id', createdOrgIds).delete()
  })

  async function insertOrg(params: {
    suffix: string
    status: string
    deletedAt?: Date | null
  }): Promise<string> {
    const id = randomUUID()
    const slug = `bug019-${runId}-${params.suffix}`
    await db.table('organizations').insert({
      id,
      name: `Bug019 ${params.suffix} ${runId}`,
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
        addressLine1: '1 Analytics Lane',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'IN',
      }),
    })
    createdOrgIds.push(id)
    return id
  }

  async function fetchSummary(client: ApiClient, token: string): Promise<PlatformSummary> {
    const response = await client
      .get('/api/v1/super-admin/analytics/summary')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)
    const summary = unwrapData<PlatformSummary>(response.body(), 'totalOrganizations')
    if (!summary) {
      throw new Error('Platform analytics summary missing totalOrganizations')
    }
    return summary
  }

  async function dashboardLiveCount(client: ApiClient, token: string): Promise<number> {
    const perPage = 100
    const first = await client
      .get('/api/v1/super-admin/organizations')
      .header('Authorization', `Bearer ${token}`)
      .qs({ page: 1, perPage })
    first.assertStatus(200)
    const unwrapped = unwrapList(first.body())
    const lastPage = unwrapped.meta?.lastPage ?? 1
    const items = [...unwrapped.items]

    for (let page = 2; page <= lastPage; page += 1) {
      const next = await client
        .get('/api/v1/super-admin/organizations')
        .header('Authorization', `Bearer ${token}`)
        .qs({ page, perPage })
      next.assertStatus(200)
      items.push(...unwrapList(next.body()).items)
    }

    return items.filter((org) => org.deletedAt === null || org.deletedAt === undefined).length
  }

  test('analytics total equals live organizations and excludes archived rows', async ({
    client,
    assert,
  }) => {
    await insertOrg({
      suffix: 'archived-a',
      status: OrganizationStatus.FALSE,
      deletedAt: new Date(),
    })
    await insertOrg({
      suffix: 'archived-b',
      status: OrganizationStatus.FALSE,
      deletedAt: new Date(),
    })

    const live = await liveOrganizationCount()
    const all = await allOrganizationCount()
    assert.isAbove(all, live)

    const token = await mintToken(DEMO_USERS.superadmin)
    const summary = await fetchSummary(client, token)

    assert.equal(summary.totalOrganizations, live)
    assert.notEqual(summary.totalOrganizations, all)
    assert.equal(summary.totalOrganizations, await dashboardLiveCount(client, token))
  })

  test('archiving an organization decrements Total Organizations on analytics', async ({
    client,
    assert,
  }) => {
    const liveId = await insertOrg({ suffix: 'to-archive', status: OrganizationStatus.ACTIVE })
    const token = await mintToken(DEMO_USERS.superadmin)

    const before = await fetchSummary(client, token)
    const liveBefore = await liveOrganizationCount()
    assert.equal(before.totalOrganizations, liveBefore)

    const archived = await client
      .delete(`/api/v1/super-admin/organizations/${liveId}`)
      .header('Authorization', `Bearer ${token}`)
    archived.assertStatus(200)

    const after = await fetchSummary(client, token)
    const liveAfter = await liveOrganizationCount()
    assert.equal(liveAfter, liveBefore - 1)
    assert.equal(after.totalOrganizations, liveAfter)
    assert.equal(after.totalOrganizations, before.totalOrganizations - 1)
    assert.equal(after.activeOrganizations, before.activeOrganizations - 1)
    assert.equal(after.inactiveOrganizations, before.inactiveOrganizations)
    assert.equal(after.totalOrganizations, await dashboardLiveCount(client, token))
  })

  test('suspended live organizations remain in Total Organizations', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const before = await fetchSummary(client, token)

    await insertOrg({ suffix: 'suspended-live', status: OrganizationStatus.SUSPENDED })

    const after = await fetchSummary(client, token)
    assert.equal(after.totalOrganizations, before.totalOrganizations + 1)
    assert.equal(after.activeOrganizations, before.activeOrganizations)
    assert.equal(after.inactiveOrganizations, before.inactiveOrganizations + 1)
    assert.equal(after.totalOrganizations, await liveOrganizationCount())
  })

  test('inserting an already-archived organization does not change totals', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const before = await fetchSummary(client, token)

    await insertOrg({
      suffix: 'archived-no-op',
      status: OrganizationStatus.FALSE,
      deletedAt: new Date(),
    })

    const after = await fetchSummary(client, token)
    assert.equal(after.totalOrganizations, before.totalOrganizations)
    assert.equal(after.activeOrganizations, before.activeOrganizations)
    assert.equal(after.inactiveOrganizations, before.inactiveOrganizations)
    assert.equal(after.trialOrganizations, before.trialOrganizations)
  })

  test('empty archived-only extra set still returns the live platform total', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const summary = await fetchSummary(client, token)
    const live = await liveOrganizationCount()
    assert.isAbove(live, 0)
    assert.equal(summary.totalOrganizations, live)
    assert.equal(summary.totalOrganizations, await dashboardLiveCount(client, token))
  })

  test('tenant user cannot read Super Admin analytics summary', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/analytics/summary')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(403)
  })
})
