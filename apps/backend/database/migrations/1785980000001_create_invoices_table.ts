import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Platform-issued billing invoices for organizations.
 * Distinct from Razorpay gateway invoices (`payment_transactions.gatewayInvoiceId`).
 */
export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('subscriptionId')
        .nullable()
        .references('organization_subscriptions.id')
        .onDelete('set null')
      table.uuid('planId').nullable().references('plans.id').onDelete('set null')
      table
        .uuid('paymentTransactionId')
        .nullable()
        .references('payment_transactions.id')
        .onDelete('set null')
      table.uuid('sourceInvoiceId').nullable().references('invoices.id').onDelete('set null')
      table.text('invoiceNumber').notNullable()
      table.text('status').notNullable()
      table.text('billingPeriod').notNullable()
      table.text('planName').notNullable()
      table.timestamp('periodStart', { useTz: true }).notNullable()
      table.timestamp('periodEnd', { useTz: true }).notNullable()
      table.date('issueDate').notNullable()
      table.date('dueDate').notNullable()
      table.string('currency', 20).notNullable()
      table.decimal('subtotal', 18, 2).notNullable()
      table.decimal('taxRate', 8, 6).notNullable().defaultTo(0)
      table.decimal('tax', 18, 2).notNullable().defaultTo(0)
      table.decimal('discount', 18, 2).notNullable().defaultTo(0)
      table.decimal('total', 18, 2).notNullable()
      table.text('notes').nullable()
      table.text('paymentMethod').nullable()
      table.text('billToName').notNullable()
      table.text('billToEmail').notNullable()
      table.text('billToPhone').nullable()
      table.text('billToAddress').nullable()
      table.text('billToGstin').nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.timestamp('paidAt', { useTz: true }).nullable()
      table.timestamp('cancelledAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_period_valid"
        CHECK ("periodEnd" > "periodStart")
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_due_on_or_after_issue"
        CHECK ("dueDate" >= "issueDate")
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_subtotal_non_negative"
        CHECK ("subtotal" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_discount_non_negative"
        CHECK ("discount" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_tax_non_negative"
        CHECK ("tax" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_total_non_negative"
        CHECK ("total" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_tax_rate_valid"
        CHECK ("taxRate" >= 0 AND "taxRate" <= 1)
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "invoices_invoice_number_unique"
        ON "invoices" ("invoiceNumber")
    `)

    this.schema.raw(`
      CREATE INDEX "invoices_org_issue_date"
        ON "invoices" ("organizationId", "issueDate" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "invoices_status"
        ON "invoices" ("status")
    `)

    this.schema.raw(`
      CREATE INDEX "invoices_subscription_id"
        ON "invoices" ("subscriptionId")
        WHERE "subscriptionId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE INDEX "invoices_payment_transaction_id"
        ON "invoices" ("paymentTransactionId")
        WHERE "paymentTransactionId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "invoices"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)

    this.schema.raw('ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "invoices_tenant_isolation"
        ON "invoices"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "invoices_tenant_isolation" ON "invoices"`)
    this.schema.dropTable(this.tableName)
  }
}
