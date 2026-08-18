import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { jsonb, upsertById } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const plansModule: DemoSeedModule = {
  id: 'plans',
  ownedTables: ['plans'],
  dependsOn: [],
  async seed(ctx) {
    const rows = [
      {
        id: FIXTURE_IDS.plans.starter,
        code: 'starter',
        name: 'Starter',
        description: 'Free tier for small teams',
        price: 0,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null as string | null,
        gatewayPlanId: null as string | null,
        isActive: true,
        sortOrder: 10,
        limits: jsonb({
          messagesPerMonth: 500,
          seats: 3,
          whatsappNumbers: 1,
          storageBytes: 1_073_741_824,
        }),
        metadata: jsonb({}),
      },
      {
        id: FIXTURE_IDS.plans.growth,
        code: 'growth',
        name: 'Growth',
        description: 'For growing support teams',
        price: 2499,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 14,
        gateway: 'razorpay',
        // Demo-only id — replace with a real Razorpay plan_XXXX in sandbox/checkout tests
        gatewayPlanId: 'plan_demo_growth_monthly',
        isActive: true,
        sortOrder: 20,
        limits: jsonb({
          messagesPerMonth: 10000,
          seats: 15,
          whatsappNumbers: 3,
          storageBytes: 10_737_418_240,
        }),
        metadata: jsonb({}),
      },
      {
        id: FIXTURE_IDS.plans.scale,
        code: 'scale',
        name: 'Scale',
        description: 'High-volume workspaces',
        price: 7499,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 14,
        gateway: 'razorpay',
        gatewayPlanId: 'plan_demo_scale_monthly',
        isActive: true,
        sortOrder: 30,
        limits: jsonb({
          messagesPerMonth: 100000,
          seats: 50,
          whatsappNumbers: 10,
          storageBytes: 107_374_182_400,
        }),
        metadata: jsonb({}),
      },
    ]

    for (const row of rows) {
      await upsertById('plans', row.id, {
        code: row.code,
        name: row.name,
        description: row.description,
        price: row.price,
        currency: row.currency,
        billingInterval: row.billingInterval,
        billingIntervalCount: row.billingIntervalCount,
        trialDays: row.trialDays,
        gateway: row.gateway,
        gatewayPlanId: row.gatewayPlanId,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        limits: row.limits,
        metadata: row.metadata,
      })
    }

    ctx.plans = { ...FIXTURE_IDS.plans }
  },
}
