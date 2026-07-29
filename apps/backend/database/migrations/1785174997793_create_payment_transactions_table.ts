import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payment_transactions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('subscriptionId')
        .notNullable()
        .references('organization_subscriptions.id')
        .onDelete('restrict')
      table.text('gateway').notNullable()
      table.text('gatewayTransactionId').notNullable()
      table.decimal('amount', 18, 2).notNullable()
      table.string('currency', 20).notNullable()
      table.text('status').notNullable()
      table.text('invoiceUrl').nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))

      table.unique(['gateway', 'gatewayTransactionId'], {
        indexName: 'payment_transactions_gateway_transaction_unique',
      })
    })

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ADD CONSTRAINT "payment_transactions_amount_positive"
        CHECK ("amount" > 0)
    `)

    this.schema.raw(`
      CREATE INDEX "payment_transactions_org_created_at"
        ON "payment_transactions" ("organizationId", "createdAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "payment_transactions" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "payment_transactions_tenant_isolation"
        ON "payment_transactions"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`
      DROP POLICY IF EXISTS "payment_transactions_tenant_isolation"
        ON "payment_transactions"
    `)
    this.schema.dropTable(this.tableName)
  }
}
