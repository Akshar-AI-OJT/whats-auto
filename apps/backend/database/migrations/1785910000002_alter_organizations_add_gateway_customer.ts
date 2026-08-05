import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Org-scoped Razorpay customer id (cust_XXXX), reused across subscriptions.
 */
export default class extends BaseSchema {
  protected tableName = 'organizations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('gateway').nullable()
      table.text('gatewayCustomerId').nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "organizations_gateway_customer_id_unique"
        ON "organizations" ("gateway", "gatewayCustomerId")
        WHERE "gatewayCustomerId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "organizations_gateway_customer_id_unique"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('gatewayCustomerId')
      table.dropColumn('gateway')
    })
  }
}
