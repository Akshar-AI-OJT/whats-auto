import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { BillingOrderApplyService } from '#services/billing/billing_order_apply_service'
import { SubscriptionMutationService } from '#services/billing/subscription_mutation_service'
import { runWithTenant } from '#services/tenant_context'

async function seedOrgPlanAndOrder() {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const gatewayOrderId = `order_${organizationId.slice(0, 8)}`
  const slug = `bill-ao-${organizationId.slice(0, 8)}`
  const now = DateTime.utc()
  const periodStart = now.toJSDate()
  const periodEnd = now.plus({ months: 1 }).toJSDate()

  await db.table('organizations').insert({
    id: organizationId,
    name: `Billing AO ${slug}`,
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
    name: 'Growth Apply',
    price: 2499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: { seats: 15, messagesPerMonth: 10000 },
    isActive: true,
    sortOrder: 20,
    metadata: {},
  })

  await runWithTenant(organizationId, async () => {
    await db.table('billing_orders').insert({
      organizationId,
      planId,
      gateway: 'razorpay',
      gatewayOrderId,
      purpose: 'new_subscription',
      status: 'created',
      amount: 2499,
      taxRate: 0,
      tax: 0,
      total: 2499,
      currency: 'INR',
      periodStart,
      periodEnd,
      planSnapshot: {
        code: `growth_${organizationId.slice(0, 8)}`,
        name: 'Growth Apply',
        price: 2499,
        currency: 'INR',
        interval: 'month',
        intervalCount: 1,
        limits: { seats: 15 },
      },
      receipt: `bo_${organizationId.slice(0, 8)}`,
      expiresAt: now.plus({ minutes: 30 }).toJSDate(),
      metadata: {},
    })
  })

  return { organizationId, planId, gatewayOrderId, periodStart, periodEnd }
}

test.group('BillingOrderApplyService', () => {
  test('applyPaidOrder activates a subscription and issues a paid invoice', async ({ assert }) => {
    const seeded = await seedOrgPlanAndOrder()
    const apply = new BillingOrderApplyService()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`

    const result = await apply.applyPaidOrder({
      gatewayOrderId: seeded.gatewayOrderId,
      gatewayPaymentId: paymentId,
      paymentMethod: 'upi',
      source: 'verify',
      organizationId: seeded.organizationId,
    })

    assert.isNotNull(result)
    assert.isFalse(result!.alreadyApplied)

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', result!.subscriptionId).first()
    })
    assert.equal(sub?.status, 'active')
    assert.equal(sub?.planId, seeded.planId)
    assert.equal(sub?.lastPaymentStatus, 'captured')

    const invoice = await runWithTenant(seeded.organizationId, async () => {
      return db.from('invoices').where('id', result!.invoiceId).first()
    })
    assert.equal(invoice?.status, 'paid')
    assert.equal(Number(invoice?.total), 2499)
    assert.equal(Number(invoice?.taxRate), 0)

    const order = await runWithTenant(seeded.organizationId, async () => {
      return db.from('billing_orders').where('gatewayOrderId', seeded.gatewayOrderId).first()
    })
    assert.equal(order?.status, 'paid')
    assert.equal(order?.subscriptionId, result!.subscriptionId)
  })

  test('verify then webhook apply is idempotent on the same order', async ({ assert }) => {
    const seeded = await seedOrgPlanAndOrder()
    const apply = new BillingOrderApplyService()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`

    const first = await apply.applyPaidOrder({
      gatewayOrderId: seeded.gatewayOrderId,
      gatewayPaymentId: paymentId,
      source: 'verify',
      organizationId: seeded.organizationId,
    })
    const second = await apply.applyPaidOrder({
      gatewayOrderId: seeded.gatewayOrderId,
      gatewayPaymentId: paymentId,
      source: 'webhook',
      organizationId: seeded.organizationId,
    })

    assert.isFalse(first!.alreadyApplied)
    assert.isTrue(second!.alreadyApplied)
    assert.equal(first!.subscriptionId, second!.subscriptionId)
    assert.equal(first!.invoiceId, second!.invoiceId)

    const invoiceCount = await runWithTenant(seeded.organizationId, async () => {
      const row = await db
        .from('invoices')
        .where('organizationId', seeded.organizationId)
        .count('* as total')
        .first()
      return Number(row?.total ?? 0)
    })
    assert.equal(invoiceCount, 1)
  })

  test('order.paid webhook path activates through SubscriptionMutationService', async ({
    assert,
  }) => {
    const seeded = await seedOrgPlanAndOrder()
    const mutations = new SubscriptionMutationService()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`

    const result = await mutations.applyEvent({
      eventType: 'order.paid',
      payload: {
        payload: {
          order: {
            entity: {
              id: seeded.gatewayOrderId,
              notes: { organizationId: seeded.organizationId },
            },
          },
          payment: {
            entity: {
              id: paymentId,
              order_id: seeded.gatewayOrderId,
              method: 'card',
              captured_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      },
    })

    assert.equal(result.outcome, 'applied')
    if (result.outcome !== 'applied') return

    const order = await runWithTenant(seeded.organizationId, async () => {
      return db.from('billing_orders').where('gatewayOrderId', seeded.gatewayOrderId).first()
    })
    assert.equal(order?.status, 'paid')
    assert.equal(result.subscriptionId, order?.subscriptionId)
  })
})
