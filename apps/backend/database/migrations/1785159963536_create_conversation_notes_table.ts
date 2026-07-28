import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Internal agent notes — never sent to WhatsApp.
 */
export default class extends BaseSchema {
  protected tableName = 'conversation_notes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('conversationId').notNullable().references('conversations.id').onDelete('cascade')
      table.uuid('authorUserId').notNullable().references('users.id').onDelete('cascade')
      table.text('body').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE INDEX "conversation_notes_conversation_created_at"
        ON "conversation_notes" ("conversationId", "createdAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "conversation_notes" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "conversation_notes" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "conversation_notes_tenant_isolation" ON "conversation_notes"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "conversation_notes_tenant_isolation" ON "conversation_notes"`
    )
    this.schema.dropTable(this.tableName)
  }
}
