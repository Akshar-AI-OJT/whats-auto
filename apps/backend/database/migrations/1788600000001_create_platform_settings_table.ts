import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Super Admin platform settings singleton (no tenant column, no RLS).
 * Secrets stay in env; this row stores operator-facing policy/branding.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_settings'

  async up() {
    await this.db.rawQuery(`
      CREATE TABLE "platform_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "singletonKey" text NOT NULL DEFAULT 'default',
        "platformName" varchar(120) NOT NULL DEFAULT 'WhatsAuto',
        "primaryDomain" varchar(253) NOT NULL DEFAULT 'localhost',
        "supportEmail" varchar(255) NOT NULL DEFAULT 'support@example.com',
        "sessionTimeoutHours" integer NOT NULL DEFAULT 12,
        "mfaEnforcement" varchar(64) NOT NULL DEFAULT 'super_admin_and_platform_admin',
        "passwordMinLength" integer NOT NULL DEFAULT 12,
        "smtpDailyLimit" integer NOT NULL DEFAULT 50000,
        "googleSignInEnabled" boolean NOT NULL DEFAULT true,
        "microsoftSignInEnabled" boolean NOT NULL DEFAULT false,
        "oauthRedirectUrl" varchar(500) NOT NULL DEFAULT 'http://localhost:3000/auth/callback',
        "maintenanceEnabled" boolean NOT NULL DEFAULT false,
        "allowlistedIps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "nextMaintenanceWindow" timestamptz NULL,
        "defaultTimezone" varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
        "dataRetentionDays" integer NOT NULL DEFAULT 180,
        "apiRateLimitPerMinute" integer NOT NULL DEFAULT 1000,
        "updatedByUserId" uuid NULL REFERENCES "users" ("id") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NULL,
        CONSTRAINT "platform_settings_singleton_key_unique" UNIQUE ("singletonKey"),
        CONSTRAINT "platform_settings_singleton_key_default" CHECK ("singletonKey" = 'default'),
        CONSTRAINT "platform_settings_mfa_check"
          CHECK ("mfaEnforcement" IN ('none', 'super_admin', 'super_admin_and_platform_admin', 'all')),
        CONSTRAINT "platform_settings_session_timeout_check"
          CHECK ("sessionTimeoutHours" BETWEEN 1 AND 168),
        CONSTRAINT "platform_settings_password_min_check"
          CHECK ("passwordMinLength" BETWEEN 8 AND 128),
        CONSTRAINT "platform_settings_smtp_daily_limit_check"
          CHECK ("smtpDailyLimit" BETWEEN 0 AND 10000000),
        CONSTRAINT "platform_settings_retention_check"
          CHECK ("dataRetentionDays" BETWEEN 1 AND 3650),
        CONSTRAINT "platform_settings_rate_limit_check"
          CHECK ("apiRateLimitPerMinute" BETWEEN 1 AND 1000000)
      )
    `)

    await this.db.rawQuery(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "platform_settings"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    await this.db.rawQuery(`
      INSERT INTO "platform_settings" ("singletonKey")
      VALUES ('default')
      ON CONFLICT ("singletonKey") DO NOTHING
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "platform_settings"`)
    await this.db.rawQuery(`DROP TABLE IF EXISTS "platform_settings"`)
  }
}
