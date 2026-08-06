import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * CSV contact import batch tracking.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_imports'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.text('fileName').notNullable()
      table.text('status').notNullable().defaultTo('pending') // pending | processing | completed | failed
      table.jsonb('columnMapping').nullable()
      table.integer('processedRows').notNullable().defaultTo(0)
      table.integer('totalRows').notNullable().defaultTo(0)
      table.integer('successCount').notNullable().defaultTo(0)
      table.integer('errorCount').notNullable().defaultTo(0)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.timestamp('completedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE INDEX "contact_import_org_status"
        ON "contact_imports" ("organizationId", "status")
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "contact_imports"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.raw('ALTER TABLE "contact_imports" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "contact_imports" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "contact_import_tenant_isolation" ON "contact_imports"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "contact_import_tenant_isolation" ON "contact_imports"`)
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "contact_imports"`)
    this.schema.dropTable(this.tableName)
  }
}
