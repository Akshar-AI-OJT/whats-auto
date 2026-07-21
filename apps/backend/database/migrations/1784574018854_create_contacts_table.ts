import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contacts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw(`gen_random_uuid()`))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('phone').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })
    this.schema.raw('ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "contacts_tenant_isolation" ON "contacts"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
