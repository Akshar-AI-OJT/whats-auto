import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'
import { unwrapListEnvelope } from '#tests/helpers/list_envelope'

type SubscriptionRow = {
  id: string
  organizationId: string
  planId: string
  status: string
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

type ListSummary = {
  active: number
  trialing: number
  past_due: number
  cancelled: number
}

function unwrapList(body: unknown): {
  items: SubscriptionRow[]
  meta: PaginationMeta | null
  summary: ListSummary | null
} {
  const page = unwrapListEnvelope<SubscriptionRow>(body)
  const summary =
    body && typeof body === 'object' && !Array.isArray(body)
      ? ((body as { summary?: ListSummary }).summary ?? null)
      : null
  return { ...page, summary }
}

function unwrapSubscription(body: unknown): SubscriptionRow | null {
  let current: unknown = body
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== 'object') return null
    const rec = current as Record<string, unknown>
    const hasId = typeof rec.id === 'string'
    const statusOk = rec.status === undefined || typeof rec.status === 'string'
    if (hasId && statusOk) {
      return rec as unknown as SubscriptionRow
    }
    if ('data' in rec && rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)) {
      current = rec.data
      continue
    }
    return null
  }
  return null
}

async function cleanupBugOrgs(slugPrefix: string) {
  const orgs = await db
    .from('organizations')
    .whereRaw('slug ILIKE ?', [`${slugPrefix}%`])
    .select('id')
  const orgIds = orgs.map((org) => org.id as string)
  if (orgIds.length > 0) {
    await db.from('authorization_audits').whereIn('organizationId', orgIds).delete()
  }
  for (const org of orgs) {
    await runWithTenant(org.id as string, async () => {
      await db.from('organization_subscriptions').where('organizationId', org.id).delete()
    })
  }
  await db
    .from('plans')
    .whereRaw('code ILIKE ?', [`${slugPrefix}%`])
    .delete()
  await db
    .from('organizations')
    .whereRaw('slug ILIKE ?', [`${slugPrefix}%`])
    .delete()
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

async function seedSubscription(params: { name: string; slug: string; status: string }) {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const subscriptionId = randomUUID()

  await db.table('organizations').insert({
    id: organizationId,
    name: params.name,
    slug: params.slug,
    email: `${params.slug}@example.com`,
    website: `https://${params.slug}.example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
  })

  await db.table('plans').insert({
    id: planId,
    code: params.slug,
    name: `${params.name} Plan`,
    price: 1499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: {},
    isActive: true,
    sortOrder: 50,
    metadata: {},
  })

  const periodStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  const periodEnd = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)

  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: subscriptionId,
      organizationId,
      planId,
      gateway: 'razorpay',
      gatewaySubscriptionId: `sub_${params.slug}`,
      status: params.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      metadata: {},
    })
  })

  return { organizationId, planId, subscriptionId }
}

test.group('BUG-020 Super Admin subscription KPI summary after mutation', (group) => {
  const needle = `Bug020Needle ${randomUUID().slice(0, 8)}`
  const seeded = {
    toEdit: null as Awaited<ReturnType<typeof seedSubscription>> | null,
    toCancel: null as Awaited<ReturnType<typeof seedSubscription>> | null,
    pastDue: null as Awaited<ReturnType<typeof seedSubscription>> | null,
    extraActive: [] as Awaited<ReturnType<typeof seedSubscription>>[],
  }

  group.tap((t) => t.timeout(30_000))

  group.setup(async () => {
    await db.from('jwks').delete()
    await cleanupBugOrgs('bug020-')
    await new DemoSeeder(db.connection()).run()

    seeded.toEdit = await seedSubscription({
      name: `${needle} Edit`,
      slug: `bug020-edit-${randomUUID().slice(0, 8)}`,
      status: 'active',
    })
    seeded.toCancel = await seedSubscription({
      name: `${needle} Cancel`,
      slug: `bug020-cancel-${randomUUID().slice(0, 8)}`,
      status: 'active',
    })
    seeded.pastDue = await seedSubscription({
      name: `${needle} PastDue`,
      slug: `bug020-pastdue-${randomUUID().slice(0, 8)}`,
      status: 'past_due',
    })
    for (let index = 0; index < 2; index++) {
      seeded.extraActive.push(
        await seedSubscription({
          name: `${needle} Extra ${index + 1}`,
          slug: `bug020-extra-${index}-${randomUUID().slice(0, 8)}`,
          status: 'active',
        })
      )
    }
  })

  group.teardown(async () => {
    await cleanupBugOrgs('bug020-')
  })

  test('editing active to past_due updates list row, KPI summary, and Postgres', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const search = `${needle} Edit`
    const before = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, perPage: 100 })
    before.assertStatus(200)
    const beforeList = unwrapList(before.body())
    assert.equal(beforeList.summary!.active, 1)
    assert.equal(beforeList.summary!.past_due, 0)
    assert.equal(beforeList.meta!.total, 1)
    assert.equal(beforeList.items[0]!.id, seeded.toEdit!.subscriptionId)
    assert.equal(beforeList.items[0]!.status, 'active')

    const updated = await client
      .patch(`/api/v1/super-admin/subscriptions/${seeded.toEdit!.subscriptionId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ status: 'past_due' })
    updated.assertStatus(200)
    assert.equal(unwrapSubscription(updated.body())?.status, 'past_due')

    const dbRow = await db
      .from('organization_subscriptions')
      .where('id', seeded.toEdit!.subscriptionId)
      .select('status')
      .first()
    assert.equal(dbRow?.status, 'past_due')

    const after = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, perPage: 100 })
    after.assertStatus(200)
    const afterList = unwrapList(after.body())
    assert.equal(afterList.items[0]!.status, 'past_due')
    assert.equal(afterList.summary!.active, 0)
    assert.equal(afterList.summary!.past_due, 1)
    assert.equal(afterList.summary!.cancelled, 0)
    assert.equal(afterList.meta!.total, 1)

    const filtered = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, status: 'past_due', perPage: 20 })
    filtered.assertStatus(200)
    const filteredList = unwrapList(filtered.body())
    assert.equal(filteredList.meta!.total, 1)
    assert.equal(filteredList.items[0]!.id, seeded.toEdit!.subscriptionId)
    assert.equal(filteredList.summary!.past_due, 1)
    assert.equal(filteredList.summary!.active, 0)
  })

  test('cancelling a subscription updates list, cancelled KPI, and persisted status', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const search = `${needle} Cancel`
    const before = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, perPage: 100 })
    before.assertStatus(200)
    const beforeList = unwrapList(before.body())
    assert.equal(beforeList.summary!.active, 1)
    assert.equal(beforeList.summary!.cancelled, 0)
    assert.equal(beforeList.meta!.total, 1)

    const deleted = await client
      .delete(`/api/v1/super-admin/subscriptions/${seeded.toCancel!.subscriptionId}`)
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(200)

    const dbRow = await db
      .from('organization_subscriptions')
      .where('id', seeded.toCancel!.subscriptionId)
      .select('status')
      .first()
    assert.equal(dbRow?.status, 'cancelled')

    const after = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, perPage: 100 })
    after.assertStatus(200)
    const afterList = unwrapList(after.body())
    assert.equal(afterList.items[0]!.id, seeded.toCancel!.subscriptionId)
    assert.equal(afterList.items[0]!.status, 'cancelled')
    assert.equal(afterList.summary!.active, 0)
    assert.equal(afterList.summary!.cancelled, 1)
    assert.equal(afterList.meta!.total, 1)

    const cancelledOnly = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, status: 'cancelled', perPage: 20 })
    cancelledOnly.assertStatus(200)
    const cancelledList = unwrapList(cancelledOnly.body())
    assert.equal(cancelledList.meta!.total, 1)
    assert.equal(cancelledList.summary!.cancelled, 1)

    const activeOnly = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search, status: 'active', perPage: 20 })
    activeOnly.assertStatus(200)
    const activeList = unwrapList(activeOnly.body())
    assert.equal(activeList.meta!.total, 0)
    assert.equal(activeList.summary!.active, 0)
  })

  test('pagination meta.total remains the filtered count', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const page1 = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Extra`, page: 1, perPage: 1 })
    page1.assertStatus(200)
    const first = unwrapList(page1.body())
    assert.equal(first.meta!.total, 2)
    assert.equal(first.meta!.perPage, 1)
    assert.equal(first.meta!.currentPage, 1)
    assert.equal(first.meta!.lastPage, 2)
    assert.equal(first.items.length, 1)
    assert.equal(first.summary!.active, 2)

    const page2 = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Extra`, page: 2, perPage: 1 })
    page2.assertStatus(200)
    const second = unwrapList(page2.body())
    assert.equal(second.meta!.total, 2)
    assert.equal(second.items.length, 1)
    assert.notEqual(second.items[0]!.id, first.items[0]!.id)
  })

  test('empty search still returns empty KPI summary after mutations', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `Bug020Nomatch ${randomUUID()}`, status: 'active', perPage: 20 })
    response.assertStatus(200)
    const listed = unwrapList(response.body())
    assert.equal(listed.meta!.total, 0)
    assert.deepEqual(listed.items, [])
    assert.equal(listed.summary!.active, 0)
    assert.equal(listed.summary!.past_due, 0)
    assert.equal(listed.summary!.cancelled, 0)
  })

  test('tenant user cannot mutate or read Super Admin subscriptions', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const list = await client
      .get('/api/v1/super-admin/subscriptions')
      .header('Authorization', `Bearer ${token}`)
    list.assertStatus(403)

    const patch = await client
      .patch(`/api/v1/super-admin/subscriptions/${seeded.toEdit!.subscriptionId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ status: 'active' })
    patch.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/super-admin/subscriptions/${seeded.toEdit!.subscriptionId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(403)
  })
})
