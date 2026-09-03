import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import {
  CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL,
  PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX,
} from '#lib/billing/plan_logical_identity'
import { isPostgresUniqueViolation } from '#lib/pg_unique_violation'
import { PlanRepository, type PlanRow } from '#repositories/plan_repository'
import { PlanService } from '#services/billing/plan_service'

test.group('PlanService', (group) => {
  group.tap((t) => t.timeout(15_000))
  test('create stores local plan without Razorpay sync', async ({ assert }) => {
    const code = `svc_${randomUUID().slice(0, 8)}`
    const service = new PlanService(new PlanRepository())

    const plan = await service.createPlan({
      name: 'Local Growth',
      code,
      description: 'Test',
      price: 2499,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      trialDays: 14,
      limits: { users: 10, messagesPerMonth: 1000 },
      features: [{ key: 'campaigns', name: 'campaigns', enabled: true, category: 'automation' }],
    })

    assert.isNull(plan.gateway)
    assert.isNull(plan.gatewayPlanId)
    assert.equal(plan.status, 'active')
    assert.equal(plan.price, 2499)
    assert.equal(plan.limits.users, 10)

    await db.from('plans').where('id', plan.id).delete()
  })

  test('create with custom pricing stays local', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())

    const plan = await service.createPlan({
      name: 'Enterprise Custom',
      code: `custom_${randomUUID().slice(0, 8)}`,
      price: null,
      currency: 'USD',
      billingPeriod: 'custom',
      status: 'draft',
      limits: {},
      features: [],
    })

    assert.isNull(plan.gateway)
    assert.isNull(plan.gatewayPlanId)
    assert.isNull(plan.price)
    assert.equal(plan.status, 'draft')

    await db.from('plans').where('id', plan.id).delete()
  })

  test('update clears gateway plan id when price changes', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const created = await service.createPlan({
      name: 'Price Change',
      code: `pc_${randomUUID().slice(0, 8)}`,
      price: 1000,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })

    await db
      .from('plans')
      .where('id', created.id)
      .update({ gateway: 'razorpay', gatewayPlanId: 'plan_rzp_stale' })

    const updated = await service.updatePlan(created.id, { price: 2000 })
    assert.isNull(updated.gateway)
    assert.isNull(updated.gatewayPlanId)
    assert.equal(updated.price, 2000)

    await db.from('plans').where('id', created.id).delete()
  })

  test('archive soft-deactivates without calling Razorpay', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const created = await service.createPlan({
      name: 'Archive Me',
      code: `arch_${randomUUID().slice(0, 8)}`,
      price: 500,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      popular: true,
      limits: {},
    })

    await db
      .from('plans')
      .where('id', created.id)
      .update({ gateway: 'razorpay', gatewayPlanId: 'plan_rzp_keep' })

    const archived = await service.archivePlan(created.id)
    assert.equal(archived.status, 'archived')
    assert.isFalse(archived.isActive)
    assert.isFalse(archived.popular)
    assert.equal(archived.gatewayPlanId, 'plan_rzp_keep')

    await db.from('plans').where('id', created.id).delete()
  })
})

test.group('PlanService uniqueness', (group) => {
  group.tap((t) => t.timeout(20_000))

  test('creating an already-existing logical active plan is rejected', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const input = {
      name: `Dup Growth ${suffix}`,
      code: `dup_g_${suffix}`,
      price: 2499,
      currency: 'INR' as const,
      billingPeriod: 'monthly' as const,
      status: 'active' as const,
      limits: {},
    }

    const first = await service.createPlan(input)
    try {
      try {
        await service.createPlan({ ...input, code: `dup_g2_${suffix}` })
        assert.fail('expected duplicate active plan to be rejected')
      } catch (error) {
        assert.equal((error as { code?: string }).code, 'E_PLAN_DUPLICATE_ACTIVE')
      }
    } finally {
      await db.from('plans').where('id', first.id).delete()
    }
  })

  test('monthly and yearly variants of the same name are not duplicates', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const monthly = await service.createPlan({
      name: `Interval ${suffix}`,
      code: `int_m_${suffix}`,
      price: 2499,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })
    const yearly = await service.createPlan({
      name: `Interval ${suffix}`,
      code: `int_y_${suffix}`,
      price: 2499,
      currency: 'INR',
      billingPeriod: 'yearly',
      status: 'active',
      limits: {},
    })

    try {
      assert.notEqual(monthly.id, yearly.id)
      assert.equal(monthly.billingPeriod, 'monthly')
      assert.equal(yearly.billingPeriod, 'yearly')
    } finally {
      await db.from('plans').whereIn('id', [monthly.id, yearly.id]).delete()
    }
  })

  test('different currencies are not treated as duplicates', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const inr = await service.createPlan({
      name: `Fx ${suffix}`,
      code: `fx_inr_${suffix}`,
      price: 2499,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })
    const usd = await service.createPlan({
      name: `Fx ${suffix}`,
      code: `fx_usd_${suffix}`,
      price: 2499,
      currency: 'USD',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })

    try {
      assert.notEqual(inr.id, usd.id)
      assert.equal(inr.currency, 'INR')
      assert.equal(usd.currency, 'USD')
    } finally {
      await db.from('plans').whereIn('id', [inr.id, usd.id]).delete()
    }
  })

  test('different prices are not treated as duplicates', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const cheaper = await service.createPlan({
      name: `Tier ${suffix}`,
      code: `tier_lo_${suffix}`,
      price: 999,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })
    const dearer = await service.createPlan({
      name: `Tier ${suffix}`,
      code: `tier_hi_${suffix}`,
      price: 1999,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })

    try {
      assert.notEqual(cheaper.id, dearer.id)
      assert.equal(cheaper.price, 999)
      assert.equal(dearer.price, 1999)
    } finally {
      await db.from('plans').whereIn('id', [cheaper.id, dearer.id]).delete()
    }
  })

  test('creating the same logical plan reactivates an archived row', async ({ assert }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const created = await service.createPlan({
      name: `Reuse ${suffix}`,
      code: `reuse_${suffix}`,
      price: 1500,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: { users: 4 },
    })
    await service.archivePlan(created.id)

    const reused = await service.createPlan({
      name: `Reuse ${suffix}`,
      code: `reuse_new_${suffix}`,
      price: 1500,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: { users: 8, messagesPerMonth: 200 },
    })

    try {
      assert.equal(reused.id, created.id)
      assert.equal(reused.status, 'active')
      assert.isTrue(reused.isActive)
      assert.equal(reused.limits.users, 8)
    } finally {
      await db.from('plans').where('id', created.id).delete()
    }
  })

  test('tenant catalog collapses duplicate active rows and keeps valid variants', async ({
    assert,
  }) => {
    const olderId = '11111111-1111-4111-8111-111111111111'
    const newerId = '22222222-2222-4222-8222-222222222222'
    const yearlyId = '33333333-3333-4333-8333-333333333333'
    const usdId = '44444444-4444-4444-8444-444444444444'
    const archivedId = '55555555-5555-4555-8555-555555555555'
    const expensiveId = '66666666-6666-4666-8666-666666666666'

    class StubPlanRepository extends PlanRepository {
      constructor(private readonly rows: PlanRow[]) {
        super()
      }
      async listAll() {
        return this.rows
      }
    }

    function row(overrides: Partial<PlanRow> & Pick<PlanRow, 'id' | 'name'>): PlanRow {
      return {
        code: `code_${overrides.id.slice(0, 8)}`,
        description: null,
        price: 2499,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 20,
        metadata: { status: 'active' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
        ...overrides,
      }
    }

    const service = new PlanService(
      new StubPlanRepository([
        row({
          id: newerId,
          name: 'Growth',
          createdAt: '2026-06-01T00:00:00.000Z',
          sortOrder: 21,
        }),
        row({
          id: olderId,
          name: 'Growth',
          createdAt: '2026-01-01T00:00:00.000Z',
          sortOrder: 20,
        }),
        row({
          id: yearlyId,
          name: 'Growth',
          billingInterval: 'year',
          price: 24990,
          sortOrder: 22,
        }),
        row({
          id: usdId,
          name: 'Growth',
          currency: 'USD',
          price: 29,
          sortOrder: 23,
        }),
        row({
          id: expensiveId,
          name: 'Growth',
          price: 4999,
          sortOrder: 24,
        }),
        row({
          id: archivedId,
          name: 'Growth',
          isActive: false,
          metadata: { status: 'archived' },
          sortOrder: 25,
        }),
      ])
    )

    const catalog = await service.listTenantPlans()
    const growth = catalog.items.filter((item) => item.name === 'Growth')
    assert.lengthOf(growth, 4)
    assert.equal(
      growth.filter((item) => item.billingPeriod === 'monthly' && item.price === 2499 && item.currency === 'INR')
        .length,
      1
    )
    assert.equal(growth.find((item) => item.price === 2499 && item.currency === 'INR')?.id, olderId)
    assert.exists(growth.find((item) => item.id === yearlyId && item.billingPeriod === 'yearly'))
    assert.exists(growth.find((item) => item.id === usdId && item.currency === 'USD'))
    assert.exists(growth.find((item) => item.id === expensiveId && item.price === 4999))
    assert.isUndefined(growth.find((item) => item.id === archivedId))
  })

  test('database unique index rejects a second active logical plan', async ({ assert }) => {
    await db.rawQuery(CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL)
    const suffix = randomUUID().slice(0, 8)
    const firstId = randomUUID()
    const secondId = randomUUID()

    await db.table('plans').insert({
      id: firstId,
      code: `ux_a_${suffix}`,
      name: `UX Growth ${suffix}`,
      price: 2100,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 0,
      gateway: null,
      gatewayPlanId: null,
      limits: {},
      isActive: true,
      sortOrder: 20,
      metadata: { status: 'active' },
    })

    try {
      try {
        await db.table('plans').insert({
          id: secondId,
          code: `ux_b_${suffix}`,
          name: `UX Growth ${suffix}`,
          price: 2100,
          currency: 'INR',
          billingInterval: 'month',
          billingIntervalCount: 1,
          trialDays: 0,
          gateway: null,
          gatewayPlanId: null,
          limits: {},
          isActive: true,
          sortOrder: 21,
          metadata: { status: 'active' },
        })
        assert.fail('expected unique identity index to reject the second insert')
      } catch (error) {
        assert.isTrue(isPostgresUniqueViolation(error, PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX))
      }
    } finally {
      await db.from('plans').whereIn('id', [firstId, secondId]).delete()
    }
  })

  test('concurrent creates of the same logical plan leave a single active row', async ({
    assert,
  }) => {
    const service = new PlanService(new PlanRepository())
    const suffix = randomUUID().slice(0, 8)
    const makeInput = (code: string) => ({
      name: `Race Growth ${suffix}`,
      code,
      price: 1750,
      currency: 'INR' as const,
      billingPeriod: 'monthly' as const,
      status: 'active' as const,
      limits: {},
    })

    const results = await Promise.allSettled([
      service.createPlan(makeInput(`race_a_${suffix}`)),
      service.createPlan(makeInput(`race_b_${suffix}`)),
    ])

    const createdIds = results
      .filter((result): result is PromiseFulfilledResult<{ id: string }> => result.status === 'fulfilled')
      .map((result) => result.value.id)
    const rejected = results.filter((result) => result.status === 'rejected')

    try {
      assert.lengthOf(createdIds, 1)
      assert.lengthOf(rejected, 1)
      assert.equal((rejected[0] as PromiseRejectedResult).reason?.code, 'E_PLAN_DUPLICATE_ACTIVE')

      const remaining = await db
        .from('plans')
        .where('name', `Race Growth ${suffix}`)
        .where('isActive', true)
      assert.lengthOf(remaining, 1)
    } finally {
      await db.from('plans').where('name', `Race Growth ${suffix}`).delete()
    }
  })
})

