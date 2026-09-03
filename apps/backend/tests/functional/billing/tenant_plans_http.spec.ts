import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { withActivePlanIdentityIndexDropped } from '#tests/helpers/plan_identity_index'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
}

type TenantPlanItem = {
  id: string
  code: string
  name: string
  price?: number | null
  currency?: string
  billingPeriod?: string
  checkoutable: boolean
  freeActivatable?: boolean
  gateway?: unknown
  gatewayPlanId?: unknown
  isActive?: unknown
  status?: unknown
  summary?: unknown
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

  const orgId = activeOrgId ?? ACTIVE_ORG_BY_EMAIL[email]
  if (orgId) {
    await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId ?? null },
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

function catalogItems(response: { body: () => unknown }): TenantPlanItem[] {
  const body = response.body() as { data?: { items?: TenantPlanItem[] } }
  return body.data?.items ?? []
}

test.group('Tenant billing plans HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/billing/plans')
    response.assertStatus(401)
  })

  test('rejects tenant without billing permission', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarViewer)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    assert.isTrue([401, 403].includes(response.response.status))
  })

  test('admin with billing:view can list active plans', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const items = catalogItems(response)
    assert.isAbove(items.length, 0)

    const ids = items.map((item) => item.id)
    assert.notInclude(ids, FIXTURE_IDS.plans.starter)
    assert.include(ids, FIXTURE_IDS.plans.growth)
    assert.include(ids, FIXTURE_IDS.plans.scale)
  })

  test('owner bypass can list plans', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.isAbove(catalogItems(response).length, 0)
  })

  test('billing:manage alone can list plans', async ({ client, assert }) => {
    const agentRole = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'agent')
      .select('id')
      .first()
    const managePerm = await db
      .from('permissions')
      .where('name', 'billing:manage')
      .select('id')
      .first()

    assert.exists(agentRole?.id)
    assert.exists(managePerm?.id)

    await db
      .table('role_permissions')
      .insert({ roleId: agentRole!.id, permissionId: managePerm!.id })
      .onConflict(['roleId', 'permissionId'])
      .ignore()

    try {
      const token = await mintToken(DEMO_USERS.northstarAgent)
      const response = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      assert.isAbove(catalogItems(response).length, 0)
    } finally {
      await db
        .from('role_permissions')
        .where('roleId', agentRole!.id)
        .where('permissionId', managePerm!.id)
        .delete()
    }
  })

  test('does not require platform/super-admin authorization', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.notEqual((response.body() as { code?: string }).code, 'PLATFORM_ACCESS_DENIED')
  })

  test('excludes inactive plans and marks checkoutable correctly', async ({ client, assert }) => {
    const draftId = randomUUID()
    const archivedId = randomUUID()
    const freeActiveId = randomUUID()

    await db.table('plans').insert([
      {
        id: draftId,
        code: `draft_${draftId.slice(0, 8)}`,
        name: 'Draft Hidden',
        description: 'Should not appear',
        price: 100,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: false,
        sortOrder: 99,
        metadata: { status: 'draft' },
      },
      {
        id: archivedId,
        code: `arch_${archivedId.slice(0, 8)}`,
        name: 'Archived Hidden',
        description: 'Should not appear',
        price: 100,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: 'razorpay',
        gatewayPlanId: 'plan_archived_demo',
        limits: {},
        isActive: false,
        sortOrder: 100,
        metadata: { status: 'archived' },
      },
      {
        id: freeActiveId,
        code: `free_${freeActiveId.slice(0, 8)}`,
        name: 'Free Active',
        description: 'Active but not checkoutable',
        price: 0,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 15,
        metadata: { status: 'active' },
      },
    ])

    try {
      const token = await mintToken(DEMO_USERS.northstarAdmin)
      const response = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const items = catalogItems(response)
      const ids = items.map((item) => item.id)

      assert.notInclude(ids, draftId)
      assert.notInclude(ids, archivedId)
      assert.notInclude(ids, FIXTURE_IDS.plans.starter)
      assert.include(ids, FIXTURE_IDS.plans.growth)
      assert.include(ids, FIXTURE_IDS.plans.scale)

      const freeActive = items.find((item) => item.id === freeActiveId)
      const growth = items.find((item) => item.id === FIXTURE_IDS.plans.growth)

      assert.exists(freeActive)
      assert.isFalse(freeActive!.checkoutable)
      assert.isTrue(freeActive!.freeActivatable)
      assert.exists(growth)
      assert.isTrue(growth!.checkoutable)
      assert.isFalse(growth!.freeActivatable)
    } finally {
      await db.from('plans').whereIn('id', [draftId, archivedId, freeActiveId]).delete()
    }
  })

  test('response omits gateway internals and admin-only fields', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    const items = catalogItems(response)

    assert.isUndefined(data.summary)
    assert.isAbove(items.length, 0)

    for (const item of items) {
      assert.isString(item.id)
      assert.match(item.id, /^[0-9a-f-]{36}$/i)
      assert.isUndefined(item.gateway)
      assert.isUndefined(item.gatewayPlanId)
      assert.isUndefined(item.isActive)
      assert.isUndefined(item.status)
      assert.notProperty(item as object, 'gateway')
      assert.notProperty(item as object, 'gatewayPlanId')
    }

    const raw = JSON.stringify(response.body())
    assert.notInclude(raw, 'gatewayPlanId')
    assert.notInclude(raw, 'plan_demo_growth_monthly')
  })

  test('plan created via super-admin appears in tenant catalog when active', async ({
    client,
    assert,
  }) => {
    const superToken = await mintToken(DEMO_USERS.superadmin)
    const code = `tenant_cat_${randomUUID().slice(0, 8)}`

    const created = await client
      .post('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${superToken}`)
      .json({
        name: 'Tenant Catalog Visible',
        code,
        description: 'Created for tenant catalog coverage',
        price: null,
        currency: 'USD',
        billingPeriod: 'custom',
        status: 'active',
        trialDays: 0,
        limits: { users: 2, messagesPerMonth: 50 },
        features: [{ key: 'inbox', name: 'Inbox', enabled: true, category: 'messaging' }],
      })

    created.assertStatus(200)
    const planId = (created.body() as { data: { id: string } }).data.id as string
    assert.isString(planId)

    try {
      const tenantToken = await mintToken(DEMO_USERS.northstarAdmin)
      const listed = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${tenantToken}`)

      listed.assertStatus(200)
      const match = catalogItems(listed).find((item) => item.id === planId)
      assert.exists(match)
      assert.equal(match!.code, code)
      assert.isFalse(match!.checkoutable)
      assert.isFalse(match!.freeActivatable)
      assert.isUndefined(match!.gatewayPlanId)
    } finally {
      await db.from('plans').where('id', planId).delete()
    }
  })

  test('returns unique logical plans so billing UI cannot render duplicate cards', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin)
    const response = await client
      .get('/api/v1/billing/plans')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const items = catalogItems(response)
    assert.isAbove(items.length, 0)

    const ids = items.map((item) => item.id)
    assert.equal(new Set(ids).size, ids.length)

    const logicalKeys = items.map(
      (item) =>
        `${(item.name ?? '').trim().toLowerCase()}|${item.billingPeriod}|${item.price}|${(item.currency ?? '').toUpperCase()}`
    )
    assert.equal(new Set(logicalKeys).size, logicalKeys.length)
  })

  test('collapses duplicate active rows of the same logical plan', async ({ client, assert }) => {
    const suffix = randomUUID().slice(0, 8)
    const olderId = randomUUID()
    const newerId = randomUUID()

    await withActivePlanIdentityIndexDropped(async () => {
      try {
        await db.table('plans').insert([
          {
            id: olderId,
            code: `http_old_${suffix}`,
            name: `HTTP Dup ${suffix}`,
            description: 'Canonical',
            price: 1111,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { users: 2, messagesPerMonth: 100 },
            isActive: true,
            sortOrder: 50,
            metadata: { status: 'active', billingPeriod: 'monthly' },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            id: newerId,
            code: `http_new_${suffix}`,
            name: `HTTP Dup ${suffix}`,
            description: 'Duplicate',
            price: 1111,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { users: 2, messagesPerMonth: 100 },
            isActive: true,
            sortOrder: 51,
            metadata: { status: 'active', billingPeriod: 'monthly' },
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        ])

        const token = await mintToken(DEMO_USERS.northstarAdmin)
        const response = await client
          .get('/api/v1/billing/plans')
          .header('Authorization', `Bearer ${token}`)

        response.assertStatus(200)
        const matches = catalogItems(response).filter((item) => item.name === `HTTP Dup ${suffix}`)
        assert.lengthOf(matches, 1)
        assert.equal(matches[0].id, olderId)
        assert.equal(matches[0].price, 1111)
        assert.equal(matches[0].currency, 'INR')
        assert.equal(matches[0].billingPeriod, 'monthly')
      } finally {
        await db.from('plans').whereIn('id', [olderId, newerId]).delete()
      }
    })
  })

  test('keeps monthly and yearly variants as separate catalog plans', async ({ client, assert }) => {
    const suffix = randomUUID().slice(0, 8)
    const monthlyId = randomUUID()
    const yearlyId = randomUUID()

    await db.table('plans').insert([
      {
        id: monthlyId,
        code: `http_m_${suffix}`,
        name: `HTTP Interval ${suffix}`,
        price: 2000,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 60,
        metadata: { status: 'active', billingPeriod: 'monthly' },
      },
      {
        id: yearlyId,
        code: `http_y_${suffix}`,
        name: `HTTP Interval ${suffix}`,
        price: 2000,
        currency: 'INR',
        billingInterval: 'year',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 61,
        metadata: { status: 'active', billingPeriod: 'yearly' },
      },
    ])

    try {
      const token = await mintToken(DEMO_USERS.northstarAdmin)
      const response = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const matches = catalogItems(response).filter(
        (item) => item.name === `HTTP Interval ${suffix}`
      )
      assert.lengthOf(matches, 2)
      assert.sameMembers(
        matches.map((item) => item.billingPeriod),
        ['monthly', 'yearly']
      )
    } finally {
      await db.from('plans').whereIn('id', [monthlyId, yearlyId]).delete()
    }
  })

  test('keeps different currencies as separate catalog plans', async ({ client, assert }) => {
    const suffix = randomUUID().slice(0, 8)
    const inrId = randomUUID()
    const usdId = randomUUID()

    await db.table('plans').insert([
      {
        id: inrId,
        code: `http_inr_${suffix}`,
        name: `HTTP Fx ${suffix}`,
        price: 3000,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 70,
        metadata: { status: 'active' },
      },
      {
        id: usdId,
        code: `http_usd_${suffix}`,
        name: `HTTP Fx ${suffix}`,
        price: 3000,
        currency: 'USD',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 71,
        metadata: { status: 'active' },
      },
    ])

    try {
      const token = await mintToken(DEMO_USERS.northstarAdmin)
      const response = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const matches = catalogItems(response).filter((item) => item.name === `HTTP Fx ${suffix}`)
      assert.lengthOf(matches, 2)
      assert.sameMembers(
        matches.map((item) => item.currency),
        ['INR', 'USD']
      )
    } finally {
      await db.from('plans').whereIn('id', [inrId, usdId]).delete()
    }
  })

  test('keeps different prices as separate catalog plans', async ({ client, assert }) => {
    const suffix = randomUUID().slice(0, 8)
    const cheapId = randomUUID()
    const dearId = randomUUID()

    await db.table('plans').insert([
      {
        id: cheapId,
        code: `http_lo_${suffix}`,
        name: `HTTP Tier ${suffix}`,
        price: 999,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 80,
        metadata: { status: 'active' },
      },
      {
        id: dearId,
        code: `http_hi_${suffix}`,
        name: `HTTP Tier ${suffix}`,
        price: 1999,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 81,
        metadata: { status: 'active' },
      },
    ])

    try {
      const token = await mintToken(DEMO_USERS.northstarAdmin)
      const response = await client
        .get('/api/v1/billing/plans')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const matches = catalogItems(response).filter((item) => item.name === `HTTP Tier ${suffix}`)
      assert.lengthOf(matches, 2)
      assert.sameMembers(
        matches.map((item) => item.price),
        [999, 1999]
      )
    } finally {
      await db.from('plans').whereIn('id', [cheapId, dearId]).delete()
    }
  })
})
