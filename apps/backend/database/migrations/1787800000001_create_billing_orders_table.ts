import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Server-side checkout intent for Orders API payments.
 * Freely deletable / duplicable per attempt — unlike invoices and payment_transactions.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_orders'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('planId').notNullable().references('plans.id').onDelete('restrict')
      table
        .uuid('subscriptionId')
        .nullable()
        .references('organization_subscriptions.id')
        .onDelete('set null')
      table.text('gateway').notNullable().defaultTo('razorpay')
      table.text('gatewayOrderId').notNullable()
      table.text('purpose').notNullable()
      table.text('status').notNullable()
      table.decimal('amount', 18, 2).notNullable()
      table.decimal('taxRate', 8, 6).notNullable().defaultTo(0)
      table.decimal('tax', 18, 2).notNullable().defaultTo(0)
      table.decimal('total', 18, 2).notNullable()
      table.string('currency', 20).notNullable()
      table.timestamp('periodStart', { useTz: true }).notNullable()
      table.timestamp('periodEnd', { useTz: true }).notNullable()
      table.jsonb('planSnapshot').notNullable()
      table
        .uuid('paymentTransactionId')
        .nullable()
        .references('payment_transactions.id')
        .onDelete('set null')
      table.uuid('invoiceId').nullable().references('invoices.id').onDelete('set null')
      table.text('receipt').nullable()
      table.timestamp('appliedAt', { useTz: true }).nullable()
      table.timestamp('expiresAt', { useTz: true }).nullable()
      table.text('failureReason').nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_purpose_valid"
        CHECK ("purpose" IN ('new_subscription', 'renewal', 'plan_change'))
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_status_valid"
        CHECK ("status" IN ('created', 'paid', 'failed', 'expired', 'cancelled'))
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_period_valid"
        CHECK ("periodEnd" > "periodStart")
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_amount_non_negative"
        CHECK ("amount" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_tax_non_negative"
        CHECK ("tax" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_total_non_negative"
        CHECK ("total" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "billing_orders"
        ADD CONSTRAINT "billing_orders_tax_rate_valid"
        CHECK ("taxRate" >= 0 AND "taxRate" <= 1)
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "billing_orders_gateway_order_id_unique"
        ON "billing_orders" ("gateway", "gatewayOrderId")
    `)

    this.schema.raw(`
      CREATE INDEX "billing_orders_org_status"
        ON "billing_orders" ("organizationId", "status")
    `)

    this.schema.raw(`
      CREATE INDEX "billing_orders_org_plan_created"
        ON "billing_orders" ("organizationId", "planId", "status")
        WHERE "status" = 'created'
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "billing_orders"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)

    this.schema.raw('ALTER TABLE "billing_orders" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "billing_orders" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "billing_orders_tenant_isolation"
        ON "billing_orders"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "billing_orders_tenant_isolation" ON "billing_orders"`)
    this.schema.dropTable(this.tableName)
  }
}
