import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { PlanRepository } from '#repositories/plan_repository'
import { PlanService } from '#services/billing/plan_service'

test.group('PlanService', () => {
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
      limits: { users: 10, messagesPerMonth: 1000, workspaces: 2 },
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
