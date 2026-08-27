import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import { signRazorpayWebhookPayload } from '#lib/razorpay/webhook_signature'
import { BillingRazorpayWebhookService } from '#services/billing/billing_razorpay_webhook_service'
import { PaymentWebhookWorker } from '#services/billing/payment_webhook_worker'
import { PaymentWebhookEventRepository } from '#repositories/payment_webhook_event_repository'
import { runWithTenant } from '#services/tenant_context'
import app from '@adonisjs/core/services/app'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import type NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'

async function seedBillingOrg() {
  const organizationId = randomUUID()
  const planId = randomUUID()
  const subscriptionId = randomUUID()
  const slug = `bill-wh-${organizationId.slice(0, 8)}`
  const gatewaySubscriptionId = `sub_${organizationId.slice(0, 8)}`

  await db.table('organizations').insert({
    id: organizationId,
    name: `Billing WH ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
    gateway: 'razorpay',
    gatewayCustomerId: `cust_${organizationId.slice(0, 8)}`,
  })

  await db.table('plans').insert({
    id: planId,
    code: `plan_${organizationId.slice(0, 8)}`,
    name: 'Growth WH',
    price: 2499,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: 'razorpay',
    gatewayPlanId: `plan_rzp_${organizationId.slice(0, 8)}`,
    limits: { seats: 10 },
    isActive: true,
    sortOrder: 1,
    metadata: {},
  })

  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: subscriptionId,
      organizationId,
      planId,
      gateway: 'razorpay',
      gatewaySubscriptionId,
      status: 'trialing',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      cancelAtPeriodEnd: false,
      metadata: {},
    })
  })

  return { organizationId, subscriptionId, gatewaySubscriptionId }
}

function capturedBody(organizationId: string, paymentId: string, gatewaySubscriptionId: string) {
  return {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: 249900,
          currency: 'INR',
          method: 'upi',
          order_id: `order_${paymentId}`,
          subscription_id: gatewaySubscriptionId,
          notes: { organizationId },
          captured_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  }
}

test.group('Billing Razorpay webhook HTTP', (group) => {
  group.each.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    const driver = (await manager.ensureStarted()) as NullJobQueueDriver
    driver.clearEnqueued()
  })

  test('POST accepts valid signature and inserts ledger row', async ({ client, assert }) => {
    const seeded = await seedBillingOrg()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const payload = capturedBody(seeded.organizationId, paymentId, seeded.gatewaySubscriptionId)
    const rawBody = JSON.stringify(payload)
    const signature = signRazorpayWebhookPayload(
      rawBody,
      env.get('RAZORPAY_WEBHOOK_SECRET').release()
    )

    const response = await client
      .post('/api/v1/webhooks/billing/razorpay')
      .header('Content-Type', 'application/json')
      .header('X-Razorpay-Signature', signature)
      .header('X-Razorpay-Event-Id', `evt_${paymentId}`)
      .json(payload)

    response.assertStatus(200)
    response.assertBody({ success: true })

    const row = await db.from('payment_webhook_events').where('eventId', `evt_${paymentId}`).first()
    assert.isNotNull(row)
    assert.equal(row?.eventType, 'payment.captured')
    assert.equal(row?.provider, 'razorpay')

    const manager = await app.container.make(JobQueueManager)
    const driver = (await manager.ensureStarted()) as NullJobQueueDriver
    assert.isAtLeast(driver.enqueued.length, 1)
    assert.equal(driver.enqueued[0]?.name, JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS)
  })

  test('POST rejects invalid signature', async ({ client }) => {
    const response = await client
      .post('/api/v1/webhooks/billing/razorpay')
      .header('X-Razorpay-Signature', 'deadbeef')
      .json({ event: 'payment.captured', payload: {} })

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_BILLING_WEBHOOK_SIGNATURE' })
  })

  test('duplicate delivery does not create a second ledger row', async ({ client, assert }) => {
    const seeded = await seedBillingOrg()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const eventId = `evt_${paymentId}`
    const payload = capturedBody(seeded.organizationId, paymentId, seeded.gatewaySubscriptionId)
    const rawBody = JSON.stringify(payload)
    const signature = signRazorpayWebhookPayload(
      rawBody,
      env.get('RAZORPAY_WEBHOOK_SECRET').release()
    )

    const headers = {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': signature,
      'X-Razorpay-Event-Id': eventId,
    }

    const first = await client
      .post('/api/v1/webhooks/billing/razorpay')
      .headers(headers)
      .json(payload)
    const second = await client
      .post('/api/v1/webhooks/billing/razorpay')
      .headers(headers)
      .json(payload)

    first.assertStatus(200)
    second.assertStatus(200)

    const count = await db
      .from('payment_webhook_events')
      .where('eventId', eventId)
      .count('* as total')
      .first()
    assert.equal(Number(count?.total), 1)
  })
})

test.group('Billing webhook worker', () => {
  test('processById mutates subscription from pending ledger row', async ({ assert }) => {
    const seeded = await seedBillingOrg()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const payload = capturedBody(seeded.organizationId, paymentId, seeded.gatewaySubscriptionId)

    const repo = new PaymentWebhookEventRepository()
    const { row } = await repo.insertOrGetExisting({
      provider: 'razorpay',
      eventId: `evt_worker_${paymentId}`,
      eventType: 'payment.captured',
      payload,
    })

    const worker = new PaymentWebhookWorker()
    const result = await worker.processById(row.id)
    assert.equal(result.outcome, 'processed')

    const sub = await runWithTenant(seeded.organizationId, async () => {
      return db.from('organization_subscriptions').where('id', seeded.subscriptionId).first()
    })
    assert.equal(sub?.status, 'active')

    const ledger = await db.from('payment_webhook_events').where('id', row.id).first()
    assert.equal(ledger?.status, 'processed')
    assert.equal(ledger?.organizationId, seeded.organizationId)
  })

  test('unknown event type is marked ignored', async ({ assert }) => {
    const { row } = await new PaymentWebhookEventRepository().insertOrGetExisting({
      provider: 'razorpay',
      eventId: `evt_ignored_${randomUUID().slice(0, 8)}`,
      eventType: 'invoice.paid',
      payload: { event: 'invoice.paid', payload: {} },
    })

    const result = await new PaymentWebhookWorker().processById(row.id)
    assert.equal(result.outcome, 'ignored')

    const ledger = await db.from('payment_webhook_events').where('id', row.id).first()
    assert.equal(ledger?.status, 'ignored')
  })

  test('service ingress + worker end-to-end without HTTP', async ({ assert }) => {
    const seeded = await seedBillingOrg()
    const paymentId = `pay_${randomUUID().slice(0, 8)}`
    const payload = capturedBody(seeded.organizationId, paymentId, seeded.gatewaySubscriptionId)
    const rawBody = JSON.stringify(payload)
    const signature = signRazorpayWebhookPayload(
      rawBody,
      env.get('RAZORPAY_WEBHOOK_SECRET').release()
    )

    const service = new BillingRazorpayWebhookService(new PaymentWebhookEventRepository())
    const accepted = await service.handleInbound({
      rawBody,
      signatureHeader: signature,
      eventIdHeader: `evt_e2e_${paymentId}`,
      body: payload,
    })

    const workerResult = await new PaymentWebhookWorker().processById(accepted.webhookEventId)
    assert.equal(workerResult.outcome, 'processed')

    const payment = await runWithTenant(seeded.organizationId, async () => {
      return db.from('payment_transactions').where('gatewayPaymentId', paymentId).first()
    })
    assert.equal(payment?.status, 'captured')
  })
})
