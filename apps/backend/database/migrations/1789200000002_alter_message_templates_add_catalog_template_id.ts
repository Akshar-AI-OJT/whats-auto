import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lineage from platform_template_catalog. Catalog delete must not cascade tenant rows.
 */
export default class extends BaseSchema {
  protected tableName = 'message_templates'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .uuid('catalogTemplateId')
        .nullable()
        .references('id')
        .inTable('platform_template_catalog')
        .onDelete('set null')
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "message_templates_org_catalog_template_unique"
        ON "message_templates" ("organizationId", "catalogTemplateId")
        WHERE "catalogTemplateId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "message_templates_org_catalog_template_unique"`)
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('catalogTemplateId')
    })
  }
}
