import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Append-only assignment history for conversations.
 */
export default class extends BaseSchema {
  protected tableName = 'conversation_assignments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('conversationId').notNullable().references('conversations.id').onDelete('cascade')
      table.uuid('agentUserId').nullable().references('users.id').onDelete('set null')
      table.uuid('assignedByUserId').nullable().references('users.id').onDelete('set null')
      table.text('reason').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE INDEX "conversation_assignments_org_agent_created_at"
        ON "conversation_assignments" ("organizationId", "agentUserId", "createdAt")
    `)

    this.schema.raw(`
      CREATE INDEX "conversation_assignments_conversation_created_at"
        ON "conversation_assignments" ("conversationId", "createdAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "conversation_assignments" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "conversation_assignments" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "conversation_assignments_tenant_isolation" ON "conversation_assignments"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "conversation_assignments_tenant_isolation" ON "conversation_assignments"`
    )
    this.schema.dropTable(this.tableName)
  }
}
