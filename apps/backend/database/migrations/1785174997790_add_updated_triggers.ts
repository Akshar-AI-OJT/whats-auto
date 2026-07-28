import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Attach shared set_updated_at() triggers to new WhatsApp / inbox tables.
 * Function already created in 1784893212402_create_update_triggers.ts.
 */
export default class extends BaseSchema {
  private readonly tables = [
    'whatsapp_configs',
    'conversations',
    'messages',
    'conversation_notes',
    'message_templates',
  ] as const

  async up() {
    for (const tableName of this.tables) {
      await this.db.rawQuery(`
        CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `)
    }
  }

  async down() {
    for (const tableName of this.tables) {
      await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "${tableName}"`)
    }
  }
}
