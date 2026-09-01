import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-node audit trail for flow session advances.
 */
export default class extends BaseSchema {
  protected tableName = 'flow_execution_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('flowSessionId').notNullable().references('flow_sessions.id').onDelete('cascade')
      table.uuid('conversationId').notNullable().references('conversations.id').onDelete('cascade')
      table.string('nodeId', 100).notNullable()
      table.string('nodeType', 50).notNullable()
      table.string('actionTaken', 100).notNullable()
      table.jsonb('inputPayload').nullable()
      table.jsonb('outputPayload').nullable()
      table.text('errorMessage').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE INDEX "flow_execution_logs_session_created"
        ON "flow_execution_logs" ("flowSessionId", "createdAt" ASC)
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
