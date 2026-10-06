import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Orgs created with country IN (create-time placeholder) and timezone UTC treat
 * campaign datetime-local as UTC wall clock (D78), so IST users schedule/display
 * ~5h30m wrong and recovery correctly skips until the UTC instant.
 *
 * Align those rows with platform_settings.defaultTimezone (default Asia/Kolkata).
 * Does not rewrite campaign scheduledAt — operators must reschedule after the fix.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      UPDATE "organizations" AS o
      SET "timezone" = COALESCE(
        (
          SELECT NULLIF(trim(ps."defaultTimezone"), '')
          FROM "platform_settings" AS ps
          WHERE ps."singletonKey" = 'default'
          LIMIT 1
        ),
        'Asia/Kolkata'
      )
      WHERE o."timezone" = 'UTC'
        AND upper(trim(o."country")) IN ('IN', 'IND', 'INDIA')
        AND o."deletedAt" IS NULL
    `)
  }

  async down() {
    // Irreversible data correction — no safe down.
  }
}
