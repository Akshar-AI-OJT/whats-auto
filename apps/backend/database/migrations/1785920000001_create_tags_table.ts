import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Contact tags per organization.
 */
export default class extends BaseSchema {
  protected tableName = 'tags'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.text('name').notNullable()
      table.text('color').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "tags_org_name_unique"
        ON "tags" ("organizationId", "name")
    `)

    this.schema.raw('ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "tags" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "tags_tenant_isolation" ON "tags"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "tags_tenant_isolation" ON "tags"`)
    this.schema.dropTable(this.tableName)
  }
}
