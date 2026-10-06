import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Restores the accounts.issuer column applied on staging (batch 40) but missing
 * from the repo. Better Auth 1.7.0–1.7.2 required this identity namespace;
 * credential → local:credential, Google → https://accounts.google.com.
 *
 * Idempotent: safe if the column/index already exist (staging) or not (fresh DB).
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "issuer" text
    `)

    await this.db.rawQuery(`
      UPDATE "accounts"
      SET "issuer" = 'local:credential'
      WHERE "providerId" = 'credential' AND ("issuer" IS NULL OR "issuer" = '')
    `)

    await this.db.rawQuery(`
      UPDATE "accounts"
      SET "issuer" = 'https://accounts.google.com'
      WHERE "providerId" = 'google' AND ("issuer" IS NULL OR "issuer" = '')
    `)

    await this.db.rawQuery(`
      UPDATE "accounts"
      SET "issuer" = 'local:oauth:' || replace("providerId", ':', '%3A')
      WHERE "issuer" IS NULL OR "issuer" = ''
    `)

    await this.db.rawQuery(`
      ALTER TABLE "accounts"
      ALTER COLUMN "issuer" SET NOT NULL
    `)

    await this.db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS "accounts_issuer_accountid_unique"
      ON "accounts" ("issuer", "accountId")
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "accounts_issuer_accountid_unique"`)
    await this.db.rawQuery(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "issuer"`)
  }
}
