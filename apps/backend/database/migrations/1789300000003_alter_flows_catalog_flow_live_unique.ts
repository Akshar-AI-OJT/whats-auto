import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One live clone per catalog flow per org. Archived clones keep catalogFlowId
 * for lineage but do not block a fresh install.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`DROP INDEX IF EXISTS "flows_org_catalog_flow_unique"`)
    this.schema.raw(`
      CREATE UNIQUE INDEX "flows_org_catalog_flow_live_unique"
        ON "flows" ("organizationId", "catalogFlowId")
        WHERE "catalogFlowId" IS NOT NULL AND "status" <> 'ARCHIVED'
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "flows_org_catalog_flow_live_unique"`)
    this.schema.raw(`
      CREATE UNIQUE INDEX "flows_org_catalog_flow_unique"
        ON "flows" ("organizationId", "catalogFlowId")
        WHERE "catalogFlowId" IS NOT NULL
    `)
  }
}
