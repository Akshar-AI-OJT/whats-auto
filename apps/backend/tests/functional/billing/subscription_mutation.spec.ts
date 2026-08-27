import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { SubscriptionMutationService } from '#services/billing/subscription_mutation_service'
import { runWithTenant } from '#services/tenant_context'

async function seedOrgWithPlanAndSub(params?: {
  status?: string
  cancelAtPeriodEnd?: boolean
  periodEndDaysFromNow?: number
}) {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const subscriptionId = randomUUID()
  const slug = `bill-mut-${organizationId.slice(0, 8)}`
  const gatewaySubscriptionId = `sub_${organizationId.slice(0, 8)}`
  const gatewayCustomerId = `cust_${organizationId.slice(0, 8)}`

  await db.table('organizations').insert({
    id: organizationId,
    name: `Billing Mut ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
    gateway: 'razorpay',
    gatewayCustomerId,
  })

  await db.table('plans').insert({
    id: planId,
    code: `growth_${organizationId.slice(0, 8)}`,
    name: 'Growth Test',
    price: 2499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: 'razorpay',
    gatewayPlanId: `plan_${organizationId.slice(0, 8)}`,
    limits: { seats: 15, messagesPerMonth: 10000 },
    isActive: true,
    sortOrder: 20,
    metadata: {},
  })

  const periodStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  const periodEnd = new Date(
    Date.now() + (params?.periodEndDaysFromNow ?? 25) * 24 * 60 * 60 * 1000
  )

  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: subscriptionId,
      organizationId,
      planId,
      gateway: 'razorpay',
      gatewaySubscriptionId,
      status: params?.status ?? 'trialing',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: params?.cancelAtPeriodEnd ?? false,
      metadata: {},
    })
  })

  return { organizationId, planId, subscriptionId, gatewaySubscriptionId, gatewayCustomerId }
}

function paymentPayload(params: {
  organizationId: string
  paymentId: string
  subscriptionId?: string
  amount?: number
  statusEvent: 'payment.captured' | 'payment.failed'
  errorCode?: string
  errorDescription?: string
}) {
  return {
    event: params.statusEvent,
    payload: {
      payment: {
        entity: {
          id: params.paymentId,
          amount: params.amount ?? 249900,
          currency: 'INR',
          method: 'upi',
          order_id: `order_${params.paymentId}`,
          subscription_id: params.subscriptionId,
          notes: { organizationId: params.organizationId },
          captured_at: Math.floor(Date.now() / 1000),
          error_code: params.errorCode,
          error_description: params.errorDescription,
        },
      },
    },
  }
}

function subscriptionPayload(params: {
  event: 'subscription.charged' | 'subscription.halted' | 'subscription.cancelled'
  organizationId: string
  gatewaySubscriptionId: string
  paymentId?: string
  currentStart?: number
  currentEnd?: number
}) {
  const payload: Record<string, unknown> = {
    subscription: {
      entity: {
        id: params.gatewaySubscriptionId,
        notes: { organizationId: params.organizationId },
        current_start: params.currentStart ?? Math.floor(Date.now() / 1000) - 86400,
        current_end: params.currentEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400,
      },
    },
  }
  if (params.paymentId) {
    payload.payment = {
      entity: {
        id: params.paymentId,
        amount: 249900,
        currency: 'INR',
        method: 'card',
        subscription_id: params.gatewaySubscriptionId,
        notes: { organizationId: params.organizationId },
        captured_at: Math.floor(Date.now() / 1000),
      },
    }
  }
  return { event: params.event, payload }
}

test.group('SubscriptionMutationService', () => {
  const mutations = new SubscriptionMutationService()

  test('payment.captured is ledger-only and does not activate a trialing subscription', async ({
    assert,
  }) => {
    const seeded = await seedOrgWithPlanAndSub({ status: 'trialing' })
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const body = paymentPayload({
      organizationId: seeded.organizationId,
      paymentId,
      subscriptionId: seeded.gatewaySubscriptionId,
      statusEvent: 'payment.captured',
    })

    const result = await mutations.applyEvent({
      eventType: 'payment.captured',
      payload: body,
    })

    assert.equal(result.outcome, 'applied')
    if (result.outcome !== 'applied') return

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'trialing')
    assert.equal(sub?.lastPaymentStatus, 'captured')

    const payment = await runWithTenant(seeded.organizationId, async () => {
      return db.from('payment_transactions').where('gatewayPaymentId', paymentId).first()
    })
    assert.equal(payment?.status, 'captured')
    assert.equal(Number(payment?.amount), 2499)
  })

  test('duplicate payment.captured is idempotent on gatewayPaymentId', async ({ assert }) => {
    const seeded = await seedOrgWithPlanAndSub({ status: 'trialing' })
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const body = paymentPayload({
      organizationId: seeded.organizationId,
      paymentId,
      subscriptionId: seeded.gatewaySubscriptionId,
      statusEvent: 'payment.captured',
    })

    await mutations.applyEvent({ eventType: 'payment.captured', payload: body })
    await mutations.applyEvent({ eventType: 'payment.captured', payload: body })

    const count = await runWithTenant(seeded.organizationId, async () => {
      const row = await db
        .from('payment_transactions')
        .where('gatewayPaymentId', paymentId)
        .count('* as total')
        .first()
      return Number(row?.total ?? 0)
    })
    assert.equal(count, 1)
  })

  test('payment.failed moves active to past_due, not cancelled', async ({ assert }) => {
    const seeded = await seedOrgWithPlanAndSub({ status: 'active' })
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const body = paymentPayload({
      organizationId: seeded.organizationId,
      paymentId,
      subscriptionId: seeded.gatewaySubscriptionId,
      statusEvent: 'payment.failed',
      errorCode: 'BAD_REQUEST_ERROR',
      errorDescription: 'card_declined',
    })

    await mutations.applyEvent({ eventType: 'payment.failed', payload: body })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'past_due')
    assert.equal(sub?.lastPaymentStatus, 'failed')

    const payment = await runWithTenant(seeded.organizationId, async () => {
      return db.from('payment_transactions').where('gatewayPaymentId', paymentId).first()
    })
    assert.equal(payment?.status, 'failed')
    assert.equal(payment?.failureCode, 'BAD_REQUEST_ERROR')
  })

  test('subscription.halted sets past_due', async ({ assert }) => {
    const seeded = await seedOrgWithPlanAndSub({ status: 'active' })
    const body = subscriptionPayload({
      event: 'subscription.halted',
      organizationId: seeded.organizationId,
      gatewaySubscriptionId: seeded.gatewaySubscriptionId,
    })

    await mutations.applyEvent({ eventType: 'subscription.halted', payload: body })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'past_due')
  })

  test('subscription.cancelled with cancelAtPeriodEnd keeps access until period end', async ({
    assert,
  }) => {
    const seeded = await seedOrgWithPlanAndSub({
      status: 'active',
      cancelAtPeriodEnd: true,
      periodEndDaysFromNow: 20,
    })
    const body = subscriptionPayload({
      event: 'subscription.cancelled',
      organizationId: seeded.organizationId,
      gatewaySubscriptionId: seeded.gatewaySubscriptionId,
    })

    await mutations.applyEvent({ eventType: 'subscription.cancelled', payload: body })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'active')
    assert.isNotNull(sub?.cancelledAt)
    assert.isTrue(sub?.cancelAtPeriodEnd)
  })

  test('subscription.cancelled immediate marks cancelled', async ({ assert }) => {
    const seeded = await seedOrgWithPlanAndSub({
      status: 'active',
      cancelAtPeriodEnd: false,
    })
    const body = subscriptionPayload({
      event: 'subscription.cancelled',
      organizationId: seeded.organizationId,
      gatewaySubscriptionId: seeded.gatewaySubscriptionId,
    })

    await mutations.applyEvent({ eventType: 'subscription.cancelled', payload: body })

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'cancelled')
    assert.isNotNull(sub?.endedAt)
  })

  test('unknown event type is ignored by isHandledEvent', ({ assert }) => {
    assert.isFalse(mutations.isHandledEvent('invoice.paid'))
    assert.isTrue(mutations.isHandledEvent('payment.captured'))
    assert.isTrue(mutations.isHandledEvent('order.paid'))
  })

  test('payment.failed without notes resolves org via billing_orders order_id', async ({
    assert,
  }) => {
    const seeded = await seedOrgWithPlanAndSub({ status: 'active' })
    const gatewayOrderId = `order_fail_${seeded.organizationId.slice(0, 8)}`
    const paymentId = `pay_${randomUUID().slice(0, 8)}`

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
        periodEnd: new Date(Date.now() + 30 * 86400000),
        planSnapshot: {
          code: 'growth',
          name: 'Growth',
          price: 2499,
          currency: 'INR',
          interval: 'month',
          intervalCount: 1,
          limits: {},
        },
        metadata: {},
      })
    })

    const result = await mutations.applyEvent({
      eventType: 'payment.failed',
      payload: {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 249900,
              currency: 'INR',
              method: 'upi',
              order_id: gatewayOrderId,
              notes: {},
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'payment_failed',
            },
          },
        },
      },
    })

    assert.equal(result.outcome, 'applied')

    const order = await runWithTenant(seeded.organizationId, async () => {
      return db.from('billing_orders').where('gatewayOrderId', gatewayOrderId).first()
    })
    assert.equal(order?.status, 'failed')
  })

  test('payment.failed with unknown order_id is ignored, never guessed', async ({ assert }) => {
    const result = await mutations.applyEvent({
      eventType: 'payment.failed',
      payload: {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: `pay_${randomUUID().slice(0, 8)}`,
              amount: 100,
              currency: 'INR',
              order_id: `order_unknown_${randomUUID().slice(0, 8)}`,
              notes: {},
            },
          },
        },
      },
    })
    assert.equal(result.outcome, 'ignored')
    if (result.outcome === 'ignored') {
      assert.equal(result.reason, 'unresolvable_organization')
    }
  })

  test('unresolvable organization is ignored, never guessed', async ({ assert }) => {
    const result = await mutations.applyEvent({
      eventType: 'payment.captured',
      payload: {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${randomUUID().slice(0, 8)}`,
              amount: 100,
              currency: 'INR',
              notes: {},
            },
          },
        },
      },
    })
    assert.equal(result.outcome, 'ignored')
    if (result.outcome === 'ignored') {
      assert.equal(result.reason, 'unresolvable_organization')
    }
  })
})
