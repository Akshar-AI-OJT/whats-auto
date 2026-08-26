import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { SubscriptionLifecycleService } from '#services/billing/subscription_lifecycle_service'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { runWithTenant } from '#services/tenant_context'

async function seedOrgWithSubscription(params: {
  status: string
  periodEnd: Date
  graceEndsAt?: Date | null
}) {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const subscriptionId = randomUUID()
  const slug = `bill-lc-${organizationId.slice(0, 8)}`

  await db.table('organizations').insert({
    id: organizationId,
    name: `Billing LC ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
  })

  await db.table('plans').insert({
    id: planId,
    code: `growth_${organizationId.slice(0, 8)}`,
    name: 'Growth LC',
    price: 2499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: { seats: 15 },
    isActive: true,
    sortOrder: 20,
    metadata: {},
  })

  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: subscriptionId,
      organizationId,
      planId,
      gateway: 'razorpay',
      status: params.status,
      currentPeriodStart: DateTime.fromJSDate(params.periodEnd).minus({ months: 1 }).toJSDate(),
      currentPeriodEnd: params.periodEnd,
      cancelAtPeriodEnd: false,
      graceEndsAt: params.graceEndsAt ?? null,
      metadata: {},
    })
  })

  return { organizationId, planId, subscriptionId }
}

test.group('SubscriptionLifecycleService', () => {
  test('flips active past period end to past_due with graceEndsAt', async ({ assert }) => {
    const periodEnd = DateTime.utc().minus({ hours: 1 }).toJSDate()
    const seeded = await seedOrgWithSubscription({ status: 'active', periodEnd })
    const now = new Date()

    await new SubscriptionLifecycleService().run({
      organizationId: seeded.organizationId,
      now,
    })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'past_due')
    assert.isNotNull(sub?.graceEndsAt)
  })

  test('expires past_due after graceEndsAt', async ({ assert }) => {
    const periodEnd = DateTime.utc().minus({ days: 10 }).toJSDate()
    const graceEndsAt = DateTime.utc().minus({ hours: 1 }).toJSDate()
    const seeded = await seedOrgWithSubscription({
      status: 'past_due',
      periodEnd,
      graceEndsAt,
    })

    await new SubscriptionLifecycleService().run({
      organizationId: seeded.organizationId,
      now: new Date(),
    })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'expired')
    assert.isNotNull(sub?.endedAt)
  })

  test('past_due within grace remains entitled; after grace it does not', async ({ assert }) => {
    const within = await seedOrgWithSubscription({
      status: 'past_due',
      periodEnd: DateTime.utc().minus({ days: 2 }).toJSDate(),
      graceEndsAt: DateTime.utc().plus({ days: 5 }).toJSDate(),
    })
    const expiredGrace = await seedOrgWithSubscription({
      status: 'past_due',
      periodEnd: DateTime.utc().minus({ days: 10 }).toJSDate(),
      graceEndsAt: DateTime.utc().minus({ hours: 1 }).toJSDate(),
    })

    const repo = new OrganizationSubscriptionRepository()
    const entitled = await runWithTenant(within.organizationId, () =>
      repo.findCurrentForEntitlements(within.organizationId)
    )
    const notEntitled = await runWithTenant(expiredGrace.organizationId, () =>
      repo.findCurrentForEntitlements(expiredGrace.organizationId)
    )

    assert.equal(entitled?.id, within.subscriptionId)
    assert.isNull(notEntitled)
  })

  test('expires stale created billing orders', async ({ assert }) => {
    const periodEnd = DateTime.utc().plus({ months: 1 }).toJSDate()
    const seeded = await seedOrgWithSubscription({ status: 'active', periodEnd })
    const gatewayOrderId = `order_exp_${seeded.organizationId.slice(0, 8)}`

    await runWithTenant(seeded.organizationId, async () => {
      await db.table('billing_orders').insert({
        organizationId: seeded.organizationId,
        planId: seeded.planId,
        gateway: 'razorpay',
        gatewayOrderId,
        purpose: 'renewal',
        status: 'created',
        amount: 2499,
        taxRate: 0,
        tax: 0,
        total: 2499,
        currency: 'INR',
        periodStart: new Date(),
        periodEnd,
        planSnapshot: {
          code: 'growth',
          name: 'Growth',
          price: 2499,
          currency: 'INR',
          interval: 'month',
          intervalCount: 1,
          limits: {},
        },
        expiresAt: DateTime.utc().minus({ minutes: 5 }).toJSDate(),
        metadata: {},
      })
    })

    await new SubscriptionLifecycleService().run({
      organizationId: seeded.organizationId,
      now: new Date(),
    })

    const order = await runWithTenant(seeded.organizationId, async () => {
      return db.from('billing_orders').where('gatewayOrderId', gatewayOrderId).first()
    })
    assert.equal(order?.status, 'expired')
  })
})
