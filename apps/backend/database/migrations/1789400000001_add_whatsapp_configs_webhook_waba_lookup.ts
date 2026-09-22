import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Narrow SELECT RLS on whatsapp_configs for post-HMAC WABA id lookup
 * (message_template_status_update and other account-level webhooks).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE POLICY "whatsapp_configs_webhook_waba_lookup" ON "whatsapp_configs"
        FOR SELECT
        USING (
          "wabaId" = NULLIF(current_setting('app.webhook_waba_id', true), '')
        )
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "whatsapp_configs_webhook_waba_lookup" ON "whatsapp_configs"`
    )
  }
}
