import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_subscriptions'

  async up() {
    this.schema.raw(
      `
      DROP INDEX IF EXISTS "organization_subscriptions_gateway_subscription_id_unique"
    `
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('gatewaySubscriptionId')
      table.dropColumn('checkoutUrl')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('gatewaySubscriptionId').nullable()
      table.text('checkoutUrl').nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "organization_subscriptions_gateway_subscription_id_unique"
        ON "organization_subscriptions" ("gateway", "gatewaySubscriptionId")
        WHERE "gatewaySubscriptionId" IS NOT NULL
    `)
  }
}
