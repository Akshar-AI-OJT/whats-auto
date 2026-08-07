import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Drop one-off message scheduling (messages.scheduledAt) if it was applied earlier.
 * Campaign scheduling remains on broadcasts.scheduledAt.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "messages_org_scheduled_at"`)
    await this.db.rawQuery(`
      ALTER TABLE "messages"
        DROP COLUMN IF EXISTS "scheduledAt"
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE "messages"
        ADD COLUMN IF NOT EXISTS "scheduledAt" timestamptz NULL
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "messages_org_scheduled_at"
        ON "messages" ("organizationId", "scheduledAt")
        WHERE "scheduledAt" IS NOT NULL AND "status" = 'scheduled'
    `)
  }
}
