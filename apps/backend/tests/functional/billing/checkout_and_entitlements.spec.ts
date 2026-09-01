import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import { BillingCheckoutService } from '#services/billing/billing_checkout_service'
import { BillingOrderApplyService } from '#services/billing/billing_order_apply_service'
import { RazorpayOrderService } from '#services/billing/razorpay_order_service'
import { BillingOrderRepository } from '#repositories/billing_order_repository'
import { OrganizationStatus } from '#enums/organization_status'
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
    status: 'active',
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
    createOrder: async (params) => ({
      id: `order_fake_${randomUUID().slice(0, 8)}`,
      amount: params.amount,
      currency: params.currency,
      status: 'created',
      receipt: params.receipt ?? null,
      notes: params.notes,
    }),
    fetchOrder: async (orderId) => ({
      id: orderId,
      amount: 249900,
      currency: 'INR',
      status: 'created',
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

test.group('RazorpayOrderService', () => {
  test('createCheckout creates a Razorpay order and local billing_orders row', async ({
    assert,
  }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    let capturedNotes: Record<string, string> | undefined

    const checkout = new RazorpayOrderService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      new BillingOrderRepository(),
      fakeRazorpay({
        createOrder: async (params) => {
          capturedNotes = params.notes
          return {
            id: `order_fake_${randomUUID().slice(0, 8)}`,
            amount: params.amount,
            currency: params.currency,
            status: 'created',
            receipt: params.receipt ?? null,
            notes: params.notes,
          }
        },
      })
    )

    const result = await checkout.createCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })

    assert.equal(result.amount, 249900)
    assert.equal(result.currency, 'INR')
    assert.equal(capturedNotes?.organizationId, seeded.organizationId)
    assert.equal(result.plan.id, seeded.planId)
    assert.isString(result.orderId)
    assert.isString(result.keyId)

    const order = await runWithTenant(seeded.organizationId, async () => {
      return db.from('billing_orders').where('gatewayOrderId', result.orderId).first()
    })
    assert.equal(order?.status, 'created')
    assert.equal(order?.purpose, 'new_subscription')
    assert.equal(Number(order?.total), 2499)
  })

  test('createCheckout reuses an unexpired created order for the same plan', async ({ assert }) => {
    const seeded = await seedOrgAndCheckoutablePlan()
    let createCount = 0
    const checkout = new RazorpayOrderService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      new BillingOrderRepository(),
      fakeRazorpay({
        createOrder: async (params) => {
          createCount += 1
          return {
            id: `order_reuse_${createCount}_${randomUUID().slice(0, 6)}`,
            amount: params.amount,
            currency: params.currency,
            status: 'created',
            receipt: params.receipt ?? null,
            notes: params.notes,
          }
        },
      })
    )

    const first = await checkout.createCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })
    const second = await checkout.createCheckout({
      organizationId: seeded.organizationId,
      planId: seeded.planId,
    })

    assert.equal(createCount, 1)
    assert.equal(first.orderId, second.orderId)
  })

  test('createCheckout rejects inactive or zero-price plan', async ({ assert }) => {
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

    const checkout = new RazorpayOrderService(
      new PlanRepository(),
      new OrganizationSubscriptionRepository(),
      new BillingOrderRepository(),
      fakeRazorpay()
    )

    await assert.rejects(
      () =>
        checkout.createCheckout({
          organizationId: seeded.organizationId,
          planId: inactivePlanId,
        }),
      /not available for Razorpay checkout/
    )
  })
})

test.group('BillingCheckoutService free activation', () => {
  test('activates an active zero-price plan without Razorpay', async ({ assert }) => {
    const organizationId = randomUUID()
    const planId = randomUUID()
    const slug = `bill-free-${organizationId.slice(0, 8)}`

    await db.table('organizations').insert({
      id: organizationId,
      name: `Free Org ${slug}`,
      slug,
      email: `${slug}@example.com`,
      phone: '+919876543210',
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: OrganizationStatus.PENDING_SETUP,
    })

    await db.table('plans').insert({
      id: planId,
      code: `free_trial_${organizationId.slice(0, 8)}`,
      name: 'Free Trial',
      price: 0,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 14,
      gateway: null,
      gatewayPlanId: null,
      limits: { seats: 3, messagesPerMonth: 500 },
      isActive: true,
      sortOrder: 5,
      metadata: { status: 'active' },
    })

    let razorpayCalled = false
    const checkout = new BillingCheckoutService(
      new PlanRepository(),
      new BillingOrderApplyService(),
      new RazorpayOrderService(
        new PlanRepository(),
        new OrganizationSubscriptionRepository(),
        new BillingOrderRepository(),
        fakeRazorpay({
          createOrder: async () => {
            razorpayCalled = true
            throw new Error('Razorpay should not be called for free plans')
          },
        })
      )
    )

    const result = await checkout.checkout({ organizationId, planId })

    assert.equal(result.mode, 'free')
    assert.isFalse(result.alreadyApplied)
    assert.isFalse(razorpayCalled)
    assert.equal(result.plan.id, planId)

    const org = await db.from('organizations').where('id', organizationId).first()
    assert.equal(org?.status, OrganizationStatus.ACTIVE)

    const subscription = await runWithTenant(organizationId, async () => {
      return db.from('organization_subscriptions').where('organizationId', organizationId).first()
    })
    assert.equal(subscription?.planId, planId)
    assert.equal(subscription?.status, 'trialing')
    assert.equal(subscription?.gateway, 'free')

    const order = await runWithTenant(organizationId, async () => {
      return db.from('billing_orders').where('organizationId', organizationId).first()
    })
    assert.equal(order?.gateway, 'free')
    assert.equal(Number(order?.total), 0)
    assert.equal(order?.status, 'paid')
  })

  test('rejects inactive zero-price plan', async ({ assert }) => {
    const organizationId = randomUUID()
    const planId = randomUUID()
    const slug = `bill-free-inactive-${organizationId.slice(0, 8)}`

    await db.table('organizations').insert({
      id: organizationId,
      name: `Free Inactive ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: OrganizationStatus.PENDING_SETUP,
    })

    await db.table('plans').insert({
      id: planId,
      code: `free_dead_${organizationId.slice(0, 8)}`,
      name: 'Inactive Free',
      price: 0,
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
    })

    const checkout = new BillingCheckoutService(
      new PlanRepository(),
      new BillingOrderApplyService(),
      new RazorpayOrderService(
        new PlanRepository(),
        new OrganizationSubscriptionRepository(),
        new BillingOrderRepository(),
        fakeRazorpay()
      )
    )

    await assert.rejects(
      () => checkout.checkout({ organizationId, planId }),
      /not available for activation/
    )
  })

  test('free activation is idempotent', async ({ assert }) => {
    const organizationId = randomUUID()
    const planId = randomUUID()
    const slug = `bill-free-idem-${organizationId.slice(0, 8)}`

    await db.table('organizations').insert({
      id: organizationId,
      name: `Free Idem ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: OrganizationStatus.PENDING_SETUP,
    })

    await db.table('plans').insert({
      id: planId,
      code: `free_idem_${organizationId.slice(0, 8)}`,
      name: 'Free Trial',
      price: 0,
      currency: 'INR',
      billingInterval: 'month',
      billingIntervalCount: 1,
      trialDays: 0,
      gateway: null,
      gatewayPlanId: null,
      limits: {},
      isActive: true,
      sortOrder: 5,
      metadata: { status: 'active' },
    })

    const checkout = new BillingCheckoutService(
      new PlanRepository(),
      new BillingOrderApplyService(),
      new RazorpayOrderService(
        new PlanRepository(),
        new OrganizationSubscriptionRepository(),
        new BillingOrderRepository(),
        fakeRazorpay()
      )
    )

    const first = await checkout.checkout({ organizationId, planId })
    const second = await checkout.checkout({ organizationId, planId })

    assert.equal(first.mode, 'free')
    assert.equal(second.mode, 'free')
    assert.isTrue(second.alreadyApplied)
  })
})
