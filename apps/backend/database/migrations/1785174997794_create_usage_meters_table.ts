import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'usage_meters'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('metric').notNullable()
      table.timestamp('periodStart', { useTz: true }).notNullable()
      table.timestamp('periodEnd', { useTz: true }).notNullable()
      table.integer('usedCount').notNullable().defaultTo(0)
      table.integer('limitCount').notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))

      table.unique(['organizationId', 'metric', 'periodStart'], {
        indexName: 'usage_meters_org_metric_period_unique',
      })
    })

    this.schema.raw(`
      ALTER TABLE "usage_meters"
        ADD CONSTRAINT "usage_meters_period_valid"
        CHECK ("periodEnd" > "periodStart"),
        ADD CONSTRAINT "usage_meters_used_count_non_negative"
        CHECK ("usedCount" >= 0),
        ADD CONSTRAINT "usage_meters_limit_count_non_negative"
        CHECK ("limitCount" >= 0)
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "usage_meters"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)

    this.schema.raw('ALTER TABLE "usage_meters" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "usage_meters" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "usage_meters_tenant_isolation"
        ON "usage_meters"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "usage_meters_tenant_isolation" ON "usage_meters"`)
    this.schema.dropTable(this.tableName)
  }
}
