import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Mid-flow handover keywords live on flow settings (D54). Drop the unused
 * platform_ai_configs column so super-admin config cannot set them.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_ai_configs'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP COLUMN IF EXISTS "handoverKeywords"
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD COLUMN IF NOT EXISTS "handoverKeywords" jsonb NOT NULL
          DEFAULT '["agent","human","representative","support","call me"]'::jsonb
    `)
  }
}
