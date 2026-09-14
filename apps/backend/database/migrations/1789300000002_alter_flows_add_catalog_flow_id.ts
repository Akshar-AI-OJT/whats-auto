import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lineage from platform_flow_catalog. Catalog delete must not cascade tenant flows.
 */
export default class extends BaseSchema {
  protected tableName = 'flows'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .uuid('catalogFlowId')
        .nullable()
        .references('id')
        .inTable('platform_flow_catalog')
        .onDelete('set null')
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "flows_org_catalog_flow_unique"
        ON "flows" ("organizationId", "catalogFlowId")
        WHERE "catalogFlowId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "flows_org_catalog_flow_unique"`)
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('catalogFlowId')
    })
  }
}
