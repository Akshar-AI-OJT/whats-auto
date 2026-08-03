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
        name: 'Starter',
        price: 0,
        currency: 'INR',
        billingInterval: 'month',
        limits: jsonb({
          messagesPerMonth: 500,
          seats: 3,
          whatsappNumbers: 1,
        }),
      },
      {
        id: FIXTURE_IDS.plans.growth,
        name: 'Growth',
        price: 2499,
        currency: 'INR',
        billingInterval: 'month',
        limits: jsonb({
          messagesPerMonth: 10000,
          seats: 15,
          whatsappNumbers: 3,
        }),
      },
      {
        id: FIXTURE_IDS.plans.scale,
        name: 'Scale',
        price: 7499,
        currency: 'INR',
        billingInterval: 'month',
        limits: jsonb({
          messagesPerMonth: 100000,
          seats: 50,
          whatsappNumbers: 10,
        }),
      },
    ]

    for (const row of rows) {
      await upsertById('plans', row.id, {
        name: row.name,
        price: row.price,
        currency: row.currency,
        billingInterval: row.billingInterval,
        limits: row.limits,
      })
    }

    ctx.plans = { ...FIXTURE_IDS.plans }
  },
}
