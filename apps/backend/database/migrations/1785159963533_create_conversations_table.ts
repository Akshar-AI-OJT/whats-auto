import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('whatsappConfigId')
        .notNullable()
        .references('whatsapp_configs.id')
        .onDelete('cascade')
      table.uuid('contactId').notNullable().references('contacts.id').onDelete('cascade')
      table.text('status').notNullable().defaultTo('open') //open, pending, closed
      table.uuid('assignedAgentId').nullable().references('users.id').onDelete('set null')
      table.text('lastMessageText').nullable()
      table.timestamp('lastMessageAt', { useTz: true }).nullable()
      table.timestamp('firstResponseAt', { useTz: true }).nullable()
      table.timestamp('closedAt', { useTz: true }).nullable()
      table.integer('unreadCount').notNullable().defaultTo(0)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()

      table.unique(['organizationId', 'whatsappConfigId', 'contactId'], {
        indexName: 'conversations_org_wa_contact_unique',
      })
    })

    this.schema.raw(`
      CREATE INDEX "conversations_org_status_last_message"
        ON "conversations" ("organizationId", "status", "lastMessageAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "conversations_org_agent_status_last_message"
        ON "conversations" ("organizationId", "assignedAgentId", "status", "lastMessageAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "conversations_org_wa_last_message"
        ON "conversations" ("organizationId", "whatsappConfigId", "lastMessageAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "conversations_tenant_isolation" ON "conversations"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "conversations_tenant_isolation" ON "conversations"`)
    this.schema.dropTable(this.tableName)
  }
}
