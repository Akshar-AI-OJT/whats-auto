import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, daysFromNow, jsonb, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const billingModule: DemoSeedModule = {
  id: 'billing',
  ownedTables: ['organization_subscriptions', 'payment_transactions', 'usage_meters'],
  dependsOn: ['organizations', 'plans'],
  async seed(ctx) {
    const periodStart = daysAgo(10)
    const periodEnd = daysFromNow(20)

    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await trx.from('organizations').where('id', FIXTURE_IDS.orgs.northstar).update({
        gateway: 'razorpay',
        gatewayCustomerId: 'cust_demo_northstar',
      })

      await upsertById(
        'organization_subscriptions',
        FIXTURE_IDS.subscriptions.northstar,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          planId: FIXTURE_IDS.plans.growth,
          gateway: 'razorpay',
          gatewaySubscriptionId: 'sub_demo_northstar',
          checkoutUrl: null,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          activatedAt: daysAgo(10),
          cancelledAt: null,
          endedAt: null,
          lastPaymentStatus: 'captured',
          lastPaymentAt: daysAgo(10),
          metadata: jsonb({ demo: true }),
        },
        trx
      )

      await upsertById(
        'payment_transactions',
        FIXTURE_IDS.payments.northstarSuccess,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          subscriptionId: FIXTURE_IDS.subscriptions.northstar,
          gateway: 'razorpay',
          gatewayOrderId: 'order_demo_northstar_success',
          gatewayPaymentId: 'pay_demo_northstar_success',
          gatewayInvoiceId: null,
          amount: 2499,
          currency: 'INR',
          status: 'captured',
          paymentMethod: 'upi',
          receiptNumber: null,
          invoiceUrl: 'https://demo.whats-auto.test/invoices/northstar-success',
          failureCode: null,
          failureReason: null,
          refundedAmount: 0,
          paidAt: daysAgo(10),
          metadata: jsonb({ attempt: 1 }),
          createdAt: daysAgo(10),
        },
        trx
      )

      await upsertById(
        'payment_transactions',
        FIXTURE_IDS.payments.northstarFailed,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          subscriptionId: FIXTURE_IDS.subscriptions.northstar,
          gateway: 'razorpay',
          gatewayOrderId: 'order_demo_northstar_failed',
          gatewayPaymentId: 'pay_demo_northstar_failed',
          gatewayInvoiceId: null,
          amount: 2499,
          currency: 'INR',
          status: 'failed',
          paymentMethod: 'card',
          receiptNumber: null,
          invoiceUrl: null,
          failureCode: 'BAD_REQUEST_ERROR',
          failureReason: 'card_declined',
          refundedAmount: 0,
          paidAt: null,
          metadata: jsonb({ error: 'card_declined' }),
          createdAt: daysAgo(40),
        },
        trx
      )

      await upsertById(
        'usage_meters',
        FIXTURE_IDS.usageMeters.northstarMessages,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          metric: 'messages',
          periodStart,
          periodEnd,
          usedCount: 1280,
          limitCount: 10000,
          updatedAt: daysAgo(0),
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'organization_subscriptions',
        FIXTURE_IDS.subscriptions.harbor,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          planId: FIXTURE_IDS.plans.starter,
          gateway: null,
          gatewaySubscriptionId: null,
          checkoutUrl: null,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          activatedAt: daysAgo(10),
          cancelledAt: null,
          endedAt: null,
          lastPaymentStatus: null,
          lastPaymentAt: null,
          metadata: jsonb({ demo: true, freeTier: true }),
        },
        trx
      )

      // Tiny captured activation charge for free-tier bookkeeping demo
      await upsertById(
        'payment_transactions',
        FIXTURE_IDS.payments.harborSuccess,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          subscriptionId: FIXTURE_IDS.subscriptions.harbor,
          gateway: 'razorpay',
          gatewayOrderId: null,
          gatewayPaymentId: 'pay_demo_harbor_activation',
          gatewayInvoiceId: null,
          amount: 0.01,
          currency: 'INR',
          status: 'captured',
          paymentMethod: null,
          receiptNumber: null,
          invoiceUrl: null,
          failureCode: null,
          failureReason: null,
          refundedAmount: 0,
          paidAt: daysAgo(10),
          metadata: jsonb({ note: 'starter activation' }),
          createdAt: daysAgo(10),
        },
        trx
      )

      await upsertById(
        'usage_meters',
        FIXTURE_IDS.usageMeters.harborMessages,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          metric: 'messages',
          periodStart,
          periodEnd,
          usedCount: 42,
          limitCount: 500,
          updatedAt: daysAgo(0),
        },
        trx
      )
    })

    ctx.subscriptions = { ...FIXTURE_IDS.subscriptions }
  },
}
