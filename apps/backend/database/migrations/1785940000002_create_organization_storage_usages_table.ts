import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-org storage quota counters. reservedBytes covers pending direct uploads;
 * readyBytes covers retained objects (including soft-deleted until hard purge).
 */
export default class extends BaseSchema {
  protected tableName = 'organization_storage_usages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('organizationId').primary().references('organizations.id').onDelete('cascade')
      table.bigInteger('readyBytes').notNullable().defaultTo(0)
      table.bigInteger('reservedBytes').notNullable().defaultTo(0)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "organization_storage_usages"
        ADD CONSTRAINT "organization_storage_usages_ready_nonneg"
        CHECK ("readyBytes" >= 0)
    `)

    this.schema.raw(`
      ALTER TABLE "organization_storage_usages"
        ADD CONSTRAINT "organization_storage_usages_reserved_nonneg"
        CHECK ("reservedBytes" >= 0)
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "organization_storage_usages"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.raw('ALTER TABLE "organization_storage_usages" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "organization_storage_usages" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "organization_storage_usages_tenant_isolation"
        ON "organization_storage_usages"
        USING (
          "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
        WITH CHECK (
          "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "organization_storage_usages_tenant_isolation" ON "organization_storage_usages"`
    )
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "organization_storage_usages"`)
    this.schema.raw(
      `ALTER TABLE "organization_storage_usages" DROP CONSTRAINT IF EXISTS "organization_storage_usages_reserved_nonneg"`
    )
    this.schema.raw(
      `ALTER TABLE "organization_storage_usages" DROP CONSTRAINT IF EXISTS "organization_storage_usages_ready_nonneg"`
    )
    this.schema.dropTable(this.tableName)
  }
}
