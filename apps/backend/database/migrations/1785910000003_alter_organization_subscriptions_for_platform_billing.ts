import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('gateway').nullable()
      table.text('gatewaySubscriptionId').nullable()
      table.text('checkoutUrl').nullable()
      table.timestamp('trialEndsAt', { useTz: true }).nullable()
      table.boolean('cancelAtPeriodEnd').notNullable().defaultTo(false)
      table.timestamp('activatedAt', { useTz: true }).nullable()
      table.timestamp('cancelledAt', { useTz: true }).nullable()
      table.timestamp('endedAt', { useTz: true }).nullable()
      table.text('lastPaymentStatus').nullable()
      table.timestamp('lastPaymentAt', { useTz: true }).nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "organization_subscriptions_gateway_subscription_id_unique"
        ON "organization_subscriptions" ("gateway", "gatewaySubscriptionId")
        WHERE "gatewaySubscriptionId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(
      `DROP INDEX IF EXISTS "organization_subscriptions_gateway_subscription_id_unique"`
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('metadata')
      table.dropColumn('lastPaymentAt')
      table.dropColumn('lastPaymentStatus')
      table.dropColumn('endedAt')
      table.dropColumn('cancelledAt')
      table.dropColumn('activatedAt')
      table.dropColumn('cancelAtPeriodEnd')
      table.dropColumn('trialEndsAt')
      table.dropColumn('checkoutUrl')
      table.dropColumn('gatewaySubscriptionId')
      table.dropColumn('gateway')
    })
  }
}
