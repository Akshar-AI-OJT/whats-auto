import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-row results for CSV contact import jobs.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_import_rows'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('importId').notNullable().references('contact_imports.id').onDelete('cascade')
      table.uuid('contactId').nullable().references('contacts.id').onDelete('set null')
      table.integer('rowNumber').notNullable()
      table.jsonb('rawData').nullable()
      table.text('status').notNullable().defaultTo('pending') // pending | processed | failed | skipped
      table.text('action').nullable() // inserted | updated | skipped | merged
      table.text('errorMessage').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "contact_import_rows_import_row"
        ON "contact_import_rows" ("importId", "rowNumber")
    `)

    this.schema.raw('ALTER TABLE "contact_import_rows" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "contact_import_rows" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "contact_import_rows_tenant_isolation" ON "contact_import_rows"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "contact_import_rows_tenant_isolation" ON "contact_import_rows"`
    )
    this.schema.dropTable(this.tableName)
  }
}
