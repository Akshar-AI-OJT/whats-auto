import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pivot table mapping contacts to tags.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_tags'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('contactId').notNullable().references('contacts.id').onDelete('cascade')
      table.uuid('tagId').notNullable().references('tags.id').onDelete('cascade')
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "contact_tags_contact_tag_unique"
        ON "contact_tags" ("contactId", "tagId")
    `)

    this.schema.raw(`
      CREATE INDEX "contact_tags_org_contact"
        ON "contact_tags" ("organizationId", "contactId")
    `)

    this.schema.raw(`
      CREATE INDEX "contact_tags_org_tag"
        ON "contact_tags" ("organizationId", "tagId")
    `)

    this.schema.raw('ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "contact_tags" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "contact_tags_tenant_isolation" ON "contact_tags"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "contact_tags_tenant_isolation" ON "contact_tags"`)
    this.schema.dropTable(this.tableName)
  }
}
