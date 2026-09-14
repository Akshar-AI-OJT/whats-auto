import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Runtime conversation execution state for published flow versions.
 */
export default class extends BaseSchema {
  protected tableName = 'flow_sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('conversationId').notNullable().references('conversations.id').onDelete('cascade')
      table.uuid('contactId').notNullable().references('contacts.id').onDelete('cascade')
      table.uuid('flowId').notNullable().references('flows.id').onDelete('cascade')
      table.uuid('flowVersionId').notNullable().references('flow_versions.id').onDelete('cascade')
      table.string('currentNodeId', 100).notNullable()
      table.string('status', 50).notNullable().defaultTo('ACTIVE')
      table.jsonb('callStack').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.jsonb('variables').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table
        .timestamp('lastInteractionAt', { useTz: true })
        .notNullable()
        .defaultTo(this.raw('now()'))
      table
        .timestamp('expiresAt', { useTz: true })
        .notNullable()
        .defaultTo(this.raw(`(now() + interval '30 minutes')`))
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "flow_sessions"
        ADD CONSTRAINT "flow_sessions_status_check"
        CHECK ("status" IN (
          'ACTIVE',
          'WAITING_FOR_INPUT',
          'PAUSED_FOR_AI',
          'PAUSED_FOR_HUMAN',
          'COMPLETED',
          'TERMINATED'
        ))
    `)

    this.schema.raw(`
      CREATE INDEX "flow_sessions_org_conversation_status"
        ON "flow_sessions" ("organizationId", "conversationId", "status")
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
