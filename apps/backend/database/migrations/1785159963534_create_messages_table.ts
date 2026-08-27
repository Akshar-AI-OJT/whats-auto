import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Chat messages for shared inbox (organizationId denormalized for RLS + analytics).
 */
export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('conversationId').notNullable().references('conversations.id').onDelete('cascade')
      table.text('senderType').notNullable() // contact, agent, system, bot, ai
      table.uuid('senderId').nullable().references('users.id').onDelete('set null')
      table.text('contentType').notNullable() //text, image, document, template, interactive
      table.text('contentText').nullable()
      table.text('mediaUrl').nullable()
      table.uuid('mediaAssetId').nullable().references('media_assets.id').onDelete('set null')
      table.uuid('messageTemplateId').nullable() // FK added when message_templates exists
      table.text('providerMessageId').nullable() //ensure proper idempotency during webhook deliveries (meta whatsappmessageid wamid)
      table.text('status').notNullable().defaultTo('queued') //queued, sent, delivered, read, failed
      table.uuid('replyToMessageId').nullable().references('messages.id').onDelete('set null')
      table.text('interactiveReplyId').nullable()
      table.jsonb('interactivePayload').nullable()
      table.text('errorMessage').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "messages_org_provider_message_id_unique"
        ON "messages" ("organizationId", "providerMessageId")
        WHERE "providerMessageId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE INDEX "messages_conversation_created_at"
        ON "messages" ("conversationId", "createdAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "messages_conversation_sender_created_at"
        ON "messages" ("conversationId", "senderType", "createdAt")
    `)

    this.schema.raw(`
      CREATE INDEX "messages_org_created_at"
        ON "messages" ("organizationId", "createdAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "messages_org_status_created_at"
        ON "messages" ("organizationId", "status", "createdAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "messages" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "messages_tenant_isolation" ON "messages"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "messages_tenant_isolation" ON "messages"`)
    this.schema.dropTable(this.tableName)
  }
}
