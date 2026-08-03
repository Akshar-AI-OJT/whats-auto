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
      await upsertById(
        'organization_subscriptions',
        FIXTURE_IDS.subscriptions.northstar,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          planId: FIXTURE_IDS.plans.growth,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAt: null,
        },
        trx
      )

      await upsertById(
        'payment_transactions',
        FIXTURE_IDS.payments.northstarSuccess,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          subscriptionId: FIXTURE_IDS.subscriptions.northstar,
          gateway: 'demo_razorpay',
          gatewayTransactionId: 'demo_txn_northstar_success',
          amount: 2499,
          currency: 'INR',
          status: 'succeeded',
          invoiceUrl: 'https://demo.whats-auto.test/invoices/northstar-success',
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
          gateway: 'demo_razorpay',
          gatewayTransactionId: 'demo_txn_northstar_failed',
          amount: 2499,
          currency: 'INR',
          status: 'failed',
          invoiceUrl: null,
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
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAt: null,
        },
        trx
      )

      await upsertById(
        'payment_transactions',
        FIXTURE_IDS.payments.harborSuccess,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          subscriptionId: FIXTURE_IDS.subscriptions.harbor,
          gateway: 'demo_stripe',
          gatewayTransactionId: 'demo_txn_harbor_success',
          amount: 0.01,
          currency: 'USD',
          status: 'succeeded',
          invoiceUrl: null,
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
