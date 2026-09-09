import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

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
  if (!body || typeof body !== 'object') return { items: [], meta: null, summary: null }

  const root = body as {
    data?:
      SubscriptionRow[] | { data?: SubscriptionRow[]; meta?: PaginationMeta; summary?: ListSummary }
    meta?: PaginationMeta
    summary?: ListSummary
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null, summary: root.summary ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data,
      meta: root.data.meta ?? root.meta ?? null,
      summary: root.data.summary ?? root.summary ?? null,
    }
  }

  return { items: [], meta: null, summary: null }
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

async function seedSubscription(params: {
  name: string
  slug: string
  status: string
  plan: {
    code: string
    name: string
    price: number
    billingInterval: string
    metadata?: Record<string, unknown>
  }
}) {
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
    code: params.plan.code,
    name: params.plan.name,
    price: params.plan.price,
    currency: 'INR',
    billingInterval: params.plan.billingInterval,
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: {},
    isActive: true,
    sortOrder: 50,
    metadata: params.plan.metadata ?? {},
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
  trialing: null as Awaited<ReturnType<typeof seedSubscription>> | null,
  custom: null as Awaited<ReturnType<typeof seedSubscription>> | null,
  pages: [] as Awaited<ReturnType<typeof seedSubscription>>[],
}

test.group('Super Admin subscriptions list filters', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    extra.trialing = await seedSubscription({
      name: 'Bug005 Trial Org',
      slug: `bug005-trial-${randomUUID().slice(0, 8)}`,
      status: 'trialing',
      plan: {
        code: `bug005-trial-${randomUUID().slice(0, 8)}`,
        name: 'Bug005 Trial Plan',
        price: 999,
        billingInterval: 'month',
      },
    })
    extra.custom = await seedSubscription({
      name: 'Bug005 Custom Org',
      slug: `bug005-custom-${randomUUID().slice(0, 8)}`,
      status: 'past_due',
      plan: {
        code: `bug005-custom-${randomUUID().slice(0, 8)}`,
        name: 'Bug005 Custom Plan',
        price: 5000,
        billingInterval: 'custom',
        metadata: { billingPeriod: 'custom', customPricing: true },
      },
    })
    extra.pages = []
    for (let index = 0; index < 3; index++) {
      extra.pages.push(
        await seedSubscription({
          name: `Bug005Needle Org ${index + 1}`,
          slug: `bug005-needle-${index}-${randomUUID().slice(0, 8)}`,
          status: 'active',
          plan: {
            code: `bug005-needle-${index}-${randomUUID().slice(0, 8)}`,
            name: `Bug005Needle Plan ${index + 1}`,
            price: 1200,
            billingInterval: 'month',
          },
        })
      )
    }
  })

  test('unfiltered list returns pagination meta and status summary across pages', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/subscriptions?page=1&perPage=2')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.equal(items.length, 2)
    assert.isObject(meta)
    assert.isAbove(meta!.total, 2)
    assert.equal(meta!.perPage, 2)
    assert.equal(meta!.currentPage, 1)
    assert.isAbove(meta!.lastPage, 1)
    assert.isObject(summary)
    assert.isAbove(summary!.active, 0)
    assert.equal(summary!.trialing, 1)
    assert.equal(summary!.past_due, 1)
  })

  test('search finds matching subscriptions that are not on the first page', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const searched = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug005Needle')}&page=1&perPage=2`
      )
      .header('Authorization', `Bearer ${token}`)

    searched.assertStatus(200)
    const { items, meta } = unwrapList(searched.body())
    assert.equal(meta!.total, 3)
    assert.equal(meta!.lastPage, 2)
    assert.equal(items.length, 2)
    assert.isTrue(items.every((row) => extra.pages.some((seed) => seed.subscriptionId === row.id)))

    const page2 = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug005Needle')}&page=2&perPage=2`
      )
      .header('Authorization', `Bearer ${token}`)
    page2.assertStatus(200)
    const second = unwrapList(page2.body())
    assert.equal(second.meta!.total, 3)
    assert.equal(second.meta!.currentPage, 2)
    assert.equal(second.items.length, 1)
    const firstIds = new Set(items.map((row) => row.id))
    assert.isFalse(firstIds.has(second.items[0]!.id))
  })

  test('status filter returns only that status and matching summary/total', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/subscriptions?status=trialing&perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.equal(meta!.total, 1)
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id, extra.trialing!.subscriptionId)
    assert.equal(items[0]!.status, 'trialing')
    assert.equal(summary!.trialing, 1)
    assert.equal(summary!.active, 0)
    assert.equal(summary!.past_due, 0)
  })

  test('plan filter returns only subscriptions on that plan', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/subscriptions?plan=${FIXTURE_IDS.plans.growth}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isAbove(items.length, 0)
    assert.equal(meta!.total, items.length)
    assert.isTrue(items.every((row) => row.planId === FIXTURE_IDS.plans.growth))
    assert.isTrue(items.some((row) => row.id === FIXTURE_IDS.subscriptions.northstar))
    assert.isFalse(items.some((row) => row.id === FIXTURE_IDS.subscriptions.harbor))
  })

  test('billing filter matches the UI monthly vs custom buckets', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const custom = await client
      .get('/api/v1/super-admin/subscriptions?billing=custom&perPage=100')
      .header('Authorization', `Bearer ${token}`)
    custom.assertStatus(200)
    const customList = unwrapList(custom.body())
    assert.isTrue(customList.items.some((row) => row.id === extra.custom!.subscriptionId))
    assert.isFalse(customList.items.some((row) => row.id === FIXTURE_IDS.subscriptions.northstar))

    const monthly = await client
      .get('/api/v1/super-admin/subscriptions?billing=monthly&perPage=100')
      .header('Authorization', `Bearer ${token}`)
    monthly.assertStatus(200)
    const monthlyList = unwrapList(monthly.body())
    assert.isTrue(monthlyList.items.some((row) => row.id === FIXTURE_IDS.subscriptions.northstar))
    assert.isFalse(monthlyList.items.some((row) => row.id === extra.custom!.subscriptionId))
  })

  test('search and status filters apply together before pagination', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const match = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug005 Trial')}&status=trialing&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)
    match.assertStatus(200)
    const matched = unwrapList(match.body())
    assert.equal(matched.meta!.total, 1)
    assert.equal(matched.items[0]!.id, extra.trialing!.subscriptionId)

    const miss = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('Bug005 Trial')}&status=active&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)
    miss.assertStatus(200)
    const missed = unwrapList(miss.body())
    assert.equal(missed.items.length, 0)
    assert.equal(missed.meta!.total, 0)
    assert.equal(missed.summary!.active, 0)
    assert.equal(missed.summary!.trialing, 0)
  })

  test('empty filters return no rows and zero totals', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/subscriptions?search=${encodeURIComponent('zzznomatchxyz')}&status=active&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta, summary } = unwrapList(response.body())
    assert.equal(items.length, 0)
    assert.equal(meta!.total, 0)
    assert.equal(summary!.active, 0)
    assert.equal(summary!.trialing, 0)
    assert.equal(summary!.past_due, 0)
  })

  test('non-platform users cannot list subscriptions', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/subscriptions?search=northstar')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
  })
})
