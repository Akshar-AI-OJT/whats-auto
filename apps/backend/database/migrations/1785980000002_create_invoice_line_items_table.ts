import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invoice_line_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('invoiceId').notNullable().references('invoices.id').onDelete('cascade')
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.integer('sortOrder').notNullable().defaultTo(0)
      table.text('description').notNullable()
      table.text('detail').nullable()
      table.decimal('quantity', 18, 4).notNullable().defaultTo(1)
      table.decimal('unitPrice', 18, 2).notNullable()
      table.decimal('amount', 18, 2).notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "invoice_line_items"
        ADD CONSTRAINT "invoice_line_items_quantity_positive"
        CHECK ("quantity" > 0)
    `)

    this.schema.raw(`
      ALTER TABLE "invoice_line_items"
        ADD CONSTRAINT "invoice_line_items_amount_non_negative"
        CHECK ("amount" >= 0)
    `)

    this.schema.raw(`
      CREATE INDEX "invoice_line_items_invoice_sort"
        ON "invoice_line_items" ("invoiceId", "sortOrder")
    `)

    this.schema.raw(`
      CREATE INDEX "invoice_line_items_org_id"
        ON "invoice_line_items" ("organizationId")
    `)

    this.schema.raw('ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "invoice_line_items" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "invoice_line_items_tenant_isolation"
        ON "invoice_line_items"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "invoice_line_items_tenant_isolation" ON "invoice_line_items"`
    )
    this.schema.dropTable(this.tableName)
  }
}
