import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import { RazorpayCheckoutService } from '#services/billing/razorpay_checkout_service'
import type { RazorpayClient } from '#lib/razorpay/types'
import { runWithTenant } from '#services/tenant_context'

async function seedOrgAndCheckoutablePlan() {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const slug = `bill-ck-${organizationId.slice(0, 8)}`

  await db.table('organizations').insert({
    id: organizationId,
    name: `Billing CK ${slug}`,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: true,
  })

  await db.table('plans').insert({
    id: planId,
    code: `growth_${organizationId.slice(0, 8)}`,
    name: 'Growth CK',
    price: 2499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 14,
    gateway: 'razorpay',
    gatewayPlanId: `plan_rzp_${organizationId.slice(0, 8)}`,
    limits: { seats: 15, messagesPerMonth: 10000, featureX: true },
    isActive: true,
    sortOrder: 20,
    metadata: {},
  })

  return { organizationId, planId }
}

function fakeRazorpay(overrides: Partial<RazorpayClient> = {}): RazorpayClient {
  return {
    createCustomer: async () => ({
      id: `cust_fake_${randomUUID().slice(0, 8)}`,
      email: 'a@b.com',
      name: 'Org',
    }),
    createSubscription: async (params) => ({
      id: `sub_fake_${randomUUID().slice(0, 8)}`,
      plan_id: params.planId,
      customer_id: params.customerId,
      status: 'created',
      short_url: 'https://rzp.io/i/demo',
      notes: params.notes,
    }),
    createPlan: async (params) => ({
      id: `plan_fake_${randomUUID().slice(0, 8)}`,
      period: params.period,
      interval: params.interval,
      item: {
        name: params.item.name,
        amount: params.item.amount,
        currency: params.item.currency,
        description: params.item.description ?? null,
      },
      notes: params.notes,
    }),
    ...overrides,
  }
}

test.group('EntitlementService', () => {
  test('returns true for numeric and boolean plan limits when entitled', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    const subscriptionId = randomUUID()

    await runWithTenant(seeded.organizationId, async () => {
      await db.table('organization_subscriptions').insert({
        id: subscriptionId,
        organizationId: seeded.organizationId,
        planId: seeded.planId,
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
        cancelAtPeriodEnd: false,
        metadata: {},
      })
    })

    const entitlements = new EntitlementService()
    assert.isTrue(await entitlements.hasEntitlement(seeded.organizationId, 'seats'))
    assert.isTrue(await entitlements.hasEntitlement(seeded.organizationId, 'featureX'))
    assert.isFalse(await entitlements.hasEntitlement(seeded.organizationId, 'missingKey'))
  })

  test('past_due remains entitled in v1', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()

    await runWithTenant(seeded.organizationId, async () => {
      await db.table('organization_subscriptions').insert({
        id: randomUUID(),
        organizationId: seeded.organizationId,
        planId: seeded.planId,
        status: 'past_due',
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 10 * 86400000),
        cancelAtPeriodEnd: false,
        metadata: {},
      })
    })

    assert.isTrue(await new EntitlementService().hasEntitlement(seeded.organizationId, 'seats'))
  })

  test('expired or hard-cancelled denies entitlement', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()

    await runWithTenant(seeded.organizationId, async () => {
      await db.table('organization_subscriptions').insert({
        id: randomUUID(),
        organizationId: seeded.organizationId,
        planId: seeded.planId,
        status: 'cancelled',
        currentPeriodStart: new Date(Date.now() - 40 * 86400000),
        currentPeriodEnd: new Date(Date.now() - 10 * 86400000),
        cancelAtPeriodEnd: false,
        cancelledAt: new Date(Date.now() - 10 * 86400000),
        endedAt: new Date(Date.now() - 10 * 86400000),
        metadata: {},
      })
    })

    assert.isFalse(await new EntitlementService().hasEntitlement(seeded.organizationId, 'seats'))
  })

  test('missing subscription denies entitlement', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    assert.isFalse(await new EntitlementService().hasEntitlement(seeded.organizationId, 'seats'))
  })
})

test.group('RazorpayCheckoutService', () => {
  test('startCheckout creates customer, subscription, and local row with notes', async ({
    assert,
  }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    let capturedNotes: Record<string, string> | undefined

    const checkout = new RazorpayCheckoutService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      fakeRazorpay({
        createSubscription: async (params) => {
          capturedNotes = params.notes
          return {
            id: `sub_fake_${randomUUID().slice(0, 8)}`,
            plan_id: params.planId,
            customer_id: params.customerId,
            status: 'created',
            short_url: 'https://rzp.io/i/demo',
            notes: params.notes,
          }
        },
      })
    )

    const result = await checkout.startCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })

    assert.equal(result.subscription.status, 'trialing')
    assert.equal(result.checkoutUrl, 'https://rzp.io/i/demo')
    assert.equal(capturedNotes?.organizationId, seeded.organizationId)
    assert.isString(result.gatewayCustomerId)

    const org = await db.from('organizations').where('id', seeded.organizationId).first()
    assert.equal(org?.gateway, 'razorpay')
    assert.equal(org?.gatewayCustomerId, result.gatewayCustomerId)
  })

  test('startCheckout lazily creates Razorpay plan when gatewayPlanId is missing', async ({
    assert,
  }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    await db
      .from('plans')
      .where('id', seeded.planId)
      .update({ gateway: null, gatewayPlanId: null })

    let createdPlanAmount: number | null = null
    const checkout = new RazorpayCheckoutService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      fakeRazorpay({
        createPlan: async (params) => {
          createdPlanAmount = params.item.amount
          return {
            id: `plan_lazy_${randomUUID().slice(0, 8)}`,
            period: params.period,
            interval: params.interval,
            item: params.item,
            notes: params.notes,
          }
        },
      })
    )

    const result = await checkout.startCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })

    assert.equal(result.checkoutUrl, 'https://rzp.io/i/demo')
    assert.equal(createdPlanAmount, 249900)

    const plan = await db.from('plans').where('id', seeded.planId).first()
    assert.equal(plan?.gateway, 'razorpay')
    assert.isString(plan?.gatewayPlanId)
  })

  test('startCheckout rejects inactive or unmapped plan', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    const inactivePlanId = randomUUID()

    await db.table('plans').insert({
      id: inactivePlanId,
      code: `dead_${inactivePlanId.slice(0, 8)}`,
      name: 'Dead',
      price: 1,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 0,
      gateway: null,
      gatewayPlanId: null,
      limits: {},
      isActive: false,
      sortOrder: 99,
      metadata: {},
    })

    const checkout = new RazorpayCheckoutService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      fakeRazorpay()
    )

    await assert.rejects(
      () =>
        checkout.startCheckout({
          organizationId: seeded.organizationId,
          planId: inactivePlanId,
        }),
      /not available for Razorpay checkout/
    )
  })

  test('startCheckout conflicts when open checkout already exists', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    const checkout = new RazorpayCheckoutService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      fakeRazorpay()
    )

    await checkout.startCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })

    await assert.rejects(
      () =>
        checkout.startCheckout({
          organizationId: seeded.organizationId,
          planId: seeded.planId,
        }),
      /checkout is already in progress/
    )
  })
})
