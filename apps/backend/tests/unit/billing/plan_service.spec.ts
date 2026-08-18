import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { RazorpayClient } from '#lib/razorpay/types'
import { PlanRepository } from '#repositories/plan_repository'
import { PlanService } from '#services/billing/plan_service'

function fakeRazorpay(overrides: Partial<RazorpayClient> = {}): RazorpayClient {
  return {
    createCustomer: async () => ({ id: 'cust_x', email: 'a@b.com', name: 'Org' }),
    createSubscription: async (params) => ({
      id: 'sub_x',
      plan_id: params.planId,
      customer_id: params.customerId,
      status: 'created',
      notes: params.notes,
    }),
    createPlan: async (params) => ({
      id: `plan_rzp_${randomUUID().slice(0, 8)}`,
      period: params.period,
      interval: params.interval,
      item: {
        name: params.item.name,
        amount: params.item.amount,
        currency: params.item.currency,
      },
      notes: params.notes,
    }),
    ...overrides,
  }
}

test.group('PlanService', () => {
  test('create syncs Razorpay plan and stores gatewayPlanId', async ({ assert }) => {
    const code = `svc_${randomUUID().slice(0, 8)}`
    const gatewayPlanId = `plan_rzp_${randomUUID().slice(0, 8)}`
    let createdAmount: number | null = null
    const service = new PlanService(
      new PlanRepository(),
      fakeRazorpay({
        createPlan: async (params) => {
          createdAmount = params.item.amount
          return {
            id: gatewayPlanId,
            period: params.period,
            interval: params.interval,
            item: params.item,
          }
        },
      })
    )

    const plan = await service.createPlan({
      name: 'Synced Growth',
      code,
      description: 'Test',
      price: 2499,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      trialDays: 14,
      limits: { users: 10, messagesPerMonth: 1000, workspaces: 2 },
      features: [{ key: 'campaigns', name: 'campaigns', enabled: true, category: 'automation' }],
    })

    assert.equal(plan.gateway, 'razorpay')
    assert.equal(plan.gatewayPlanId, gatewayPlanId)
    assert.equal(createdAmount, 249900)
    assert.equal(plan.status, 'active')
    assert.equal(plan.limits.users, 10)

    await db.from('plans').where('id', plan.id).delete()
  })

  test('create with custom pricing skips Razorpay', async ({ assert }) => {
    let called = false
    const service = new PlanService(
      new PlanRepository(),
      fakeRazorpay({
        createPlan: async (params) => {
          called = true
          return {
            id: 'should_not',
            period: params.period,
            interval: params.interval,
          }
        },
      })
    )

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

    assert.isFalse(called)
    assert.isNull(plan.gatewayPlanId)
    assert.isNull(plan.price)
    assert.equal(plan.status, 'draft')

    await db.from('plans').where('id', plan.id).delete()
  })

  test('update recreates Razorpay plan when price changes', async ({ assert }) => {
    const service = new PlanService(new PlanRepository(), fakeRazorpay())
    const created = await service.createPlan({
      name: 'Price Change',
      code: `pc_${randomUUID().slice(0, 8)}`,
      price: 1000,
      currency: 'INR',
      billingPeriod: 'monthly',
      status: 'active',
      limits: {},
    })

    const firstGatewayId = created.gatewayPlanId
    assert.isString(firstGatewayId)

    const updated = await service.updatePlan(created.id, { price: 2000 })
    assert.isString(updated.gatewayPlanId)
    assert.notEqual(updated.gatewayPlanId, firstGatewayId)
    assert.equal(updated.price, 2000)

    await db.from('plans').where('id', created.id).delete()
  })

  test('archive soft-deactivates without clearing gateway id', async ({ assert }) => {
    const service = new PlanService(new PlanRepository(), fakeRazorpay())
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

    const archived = await service.archivePlan(created.id)
    assert.equal(archived.status, 'archived')
    assert.isFalse(archived.isActive)
    assert.isFalse(archived.popular)
    assert.equal(archived.gatewayPlanId, created.gatewayPlanId)

    await db.from('plans').where('id', created.id).delete()
  })
})
