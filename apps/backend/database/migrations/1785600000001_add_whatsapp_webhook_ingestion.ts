import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Webhook ingestion schema:
 * - Narrow SELECT RLS on whatsapp_configs for post-HMAC phone_number_id lookup
 * - Message lifecycle timestamps + metadata jsonb for Meta provider extras
 * - Chronological inbox index on (conversationId, occurredAt DESC)
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE POLICY "whatsapp_configs_webhook_phone_lookup" ON "whatsapp_configs"
        FOR SELECT
        USING (
          "phoneNumberId" = NULLIF(current_setting('app.webhook_phone_number_id', true), '')
        )
    `)

    this.schema.alterTable('messages', (table) => {
      table.timestamp('occurredAt', { useTz: true }).nullable()
      table.timestamp('providerStatusAt', { useTz: true }).nullable()
      table.timestamp('sentAt', { useTz: true }).nullable()
      table.timestamp('deliveredAt', { useTz: true }).nullable()
      table.timestamp('readAt', { useTz: true }).nullable()
      table.timestamp('failedAt', { useTz: true }).nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
    })

    this.schema.raw(`
      CREATE INDEX "messages_conversation_occurred_at"
        ON "messages" ("conversationId", "occurredAt" DESC)
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "messages_conversation_occurred_at"`)

    this.schema.alterTable('messages', (table) => {
      table.dropColumn('metadata')
      table.dropColumn('failedAt')
      table.dropColumn('readAt')
      table.dropColumn('deliveredAt')
      table.dropColumn('sentAt')
      table.dropColumn('providerStatusAt')
      table.dropColumn('occurredAt')
    })

    this.schema.raw(
      `DROP POLICY IF EXISTS "whatsapp_configs_webhook_phone_lookup" ON "whatsapp_configs"`
    )
  }
}
