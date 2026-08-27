import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Flow container (trigger + publish pointer). Graph lives in flow_versions.
 * publishedVersionId FK is added after flow_versions exists (1787600000002).
 */
export default class extends BaseSchema {
  protected tableName = 'flows'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.string('name', 255).notNullable()
      table.text('description').nullable()
      table.string('status', 50).notNullable().defaultTo('DRAFT')
      table.boolean('isDefault').notNullable().defaultTo(false)
      table.uuid('publishedVersionId').nullable()
      table.string('triggerType', 50).notNullable().defaultTo('KEYWORD')
      table.jsonb('triggerConfig').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.jsonb('settings').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "flows"
        ADD CONSTRAINT "flows_status_check"
        CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
    `)

    this.schema.raw(`
      CREATE INDEX "flows_org_status" ON "flows" ("organizationId", "status")
    `)

    await this.#enableTenantRls(this.tableName)
  }

  async down() {
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
