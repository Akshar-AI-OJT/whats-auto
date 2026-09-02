import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Immutable graph snapshots (nodes/edges JSON). Links flows.publishedVersionId.
 */
export default class extends BaseSchema {
  protected tableName = 'flow_versions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('flowId').notNullable().references('flows.id').onDelete('cascade')
      table.integer('versionNumber').notNullable().defaultTo(1)
      table.jsonb('nodes').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.jsonb('edges').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.jsonb('viewport').nullable().defaultTo(this.raw(`'{"x":0,"y":0,"zoom":1}'::jsonb`))
      table.string('validationStatus', 50).notNullable().defaultTo('VALID')
      table.jsonb('validationErrors').nullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "flow_versions"
        ADD CONSTRAINT "flow_versions_unique_flow_version"
        UNIQUE ("flowId", "versionNumber")
    `)

    this.schema.raw(`
      ALTER TABLE "flows"
        ADD CONSTRAINT "flows_published_version_fk"
        FOREIGN KEY ("publishedVersionId") REFERENCES "flow_versions" ("id") ON DELETE SET NULL
    `)

    await this.#enableTenantRls(this.tableName)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE "flows" DROP CONSTRAINT IF EXISTS "flows_published_version_fk"
    `)
    await this.#dropTenantRls(this.tableName)
    this.schema.dropTable(this.tableName)
  }

  async #enableTenantRls(tableName: string) {
    this.schema.raw(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`)
    this.schema.raw(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`)
    this.schema.raw(`
      CREATE POLICY "${tableName}_tenant_isolation" ON "${tableName}"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async #dropTenantRls(tableName: string) {
    this.schema.raw(`DROP POLICY IF EXISTS "${tableName}_tenant_isolation" ON "${tableName}"`)
  }
}
