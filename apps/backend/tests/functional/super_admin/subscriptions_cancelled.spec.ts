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

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function cleanupBugOrgs(slugPrefix: string) {
  const orgs = await db
    .from('organizations')
    .whereRaw('slug ILIKE ?', [`${slugPrefix}%`])
    .select('id')
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
    body: { payload: payload as Record<string, any> },
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
    name: `${params.name} Plan ${randomUUID().slice(0, 8)}`,
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

const extra = {
  cancelled: [] as Awaited<ReturnType<typeof seedSubscription>>[],
  active: null as Awaited<ReturnType<typeof seedSubscription>> | null,
  toDelete: null as Awaited<ReturnType<typeof seedSubscription>> | null,
  toPatch: null as Awaited<ReturnType<typeof seedSubscription>> | null,
}

test.group('BUG-017 Super Admin cancelled subscriptions', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await cleanupBugOrgs('bug017-')
    await cleanupBugOrgs('bug005-')
    await new DemoSeeder(db.connection()).run()

    extra.cancelled = []
    for (let index = 0; index < 3; index++) {
      extra.cancelled.push(
        await seedSubscription({
          name: `Bug017Needle Org ${index + 1}`,
          slug: `bug017-needle-${index}-${randomUUID().slice(0, 8)}`,
          status: 'cancelled',
        })
      )
    }

    extra.active = await seedSubscription({
      name: 'Bug017 Active Control',
      slug: `bug017-active-${randomUUID().slice(0, 8)}`,
      status: 'active',
    })

    extra.toDelete = await seedSubscription({
      name: 'Bug017 Delete Target',
      slug: `bug017-delete-${randomUUID().slice(0, 8)}`,
      status: 'active',
    })

    extra.toPatch = await seedSubscription({
      name: 'Bug017 Patch Target',
      slug: `bug017-patch-${randomUUID().slice(0, 8)}`,
      status: 'active',
    })
  })

  test('cancelled filter returns cancelled rows and matching summary/total', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017Needle')}&status=cancelled&perPage=100`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.equal(meta!.total, 3)
    assert.equal(items.length, 3)
    assert.isTrue(items.every((row) => row.status === 'cancelled'))
    assert.isTrue(
      extra.cancelled.every((seed) => items.some((row) => row.id === seed.subscriptionId))
    )
    assert.equal(summary!.cancelled, 3)
    assert.equal(summary!.active, 0)
    assert.equal(summary!.trialing, 0)
    assert.equal(summary!.past_due, 0)
  })

  test('unfiltered search summary counts cancelled in the KPI dataset', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017Needle')}&perPage=100`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.equal(meta!.total, 3)
    assert.equal(items.length, 3)
    assert.equal(summary!.cancelled, 3)
    assert.equal(summary!.active, 0)
  })

  test('active filter does not include cancelled subscriptions', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/subscriptions?status=active&perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.isAbove(items.length, 0)
    assert.equal(meta!.total, items.length)
    assert.isTrue(items.every((row) => row.status === 'active'))
    assert.isFalse(
      items.some((row) => extra.cancelled.some((seed) => seed.subscriptionId === row.id))
    )
    assert.isTrue(items.some((row) => row.id === extra.active!.subscriptionId))
    assert.equal(summary!.cancelled, 0)
    assert.equal(summary!.active, items.length)
  })

  test('cancelled filter paginates after filtering with correct lastPage', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const page1 = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017Needle')}&status=cancelled&page=1&perPage=2`
      )
      .header('Authorization', `Bearer ${token}`)

    page1.assertStatus(200)
    const first = unwrapList(page1.body())
    assert.equal(first.meta!.total, 3)
    assert.equal(first.meta!.perPage, 2)
    assert.equal(first.meta!.currentPage, 1)
    assert.equal(first.meta!.lastPage, 2)
    assert.equal(first.items.length, 2)
    assert.equal(first.summary!.cancelled, 3)

    const page2 = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017Needle')}&status=cancelled&page=2&perPage=2`
      )
      .header('Authorization', `Bearer ${token}`)
    page2.assertStatus(200)
    const second = unwrapList(page2.body())
    assert.equal(second.meta!.total, 3)
    assert.equal(second.meta!.currentPage, 2)
    assert.equal(second.items.length, 1)
    const firstIds = new Set(first.items.map((row) => row.id))
    assert.isFalse(firstIds.has(second.items[0]!.id))
  })

  test('delete sets cancelled and the row stays listable and readable', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const targetId = extra.toDelete!.subscriptionId

    const deleted = await client
      .delete(`/api/v1/super-admin/subscriptions/${targetId}`)
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(200)

    const listed = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017 Delete')}&status=cancelled&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const list = unwrapList(listed.body())
    assert.equal(list.meta!.total, 1)
    assert.equal(list.items[0]!.id, targetId)
    assert.equal(list.items[0]!.status, 'cancelled')
    assert.equal(list.summary!.cancelled, 1)

    const shown = await client
      .get(`/api/v1/super-admin/subscriptions/${targetId}`)
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    const row = unwrapSubscription(shown.body())
    assert.equal(row?.id, targetId)
    assert.equal(row?.status, 'cancelled')

    const again = await client
      .delete(`/api/v1/super-admin/subscriptions/${targetId}`)
      .header('Authorization', `Bearer ${token}`)
    again.assertStatus(409)
    assert.equal(errorBody(again).code, 'E_SUBSCRIPTION_ALREADY_DELETED')
  })

  test('patch to cancelled keeps the subscription in the cancelled filter', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const targetId = extra.toPatch!.subscriptionId

    const updated = await client
      .patch(`/api/v1/super-admin/subscriptions/${targetId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ status: 'cancelled' })
    updated.assertStatus(200)
    assert.equal(unwrapSubscription(updated.body())?.status, 'cancelled')

    const listed = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug017 Patch')}&status=cancelled&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const list = unwrapList(listed.body())
    assert.equal(list.meta!.total, 1)
    assert.equal(list.items[0]!.id, targetId)
    assert.equal(list.summary!.cancelled, 1)
  })

  test('non-platform users cannot list cancelled subscriptions', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/subscriptions?status=cancelled')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
  })
})
