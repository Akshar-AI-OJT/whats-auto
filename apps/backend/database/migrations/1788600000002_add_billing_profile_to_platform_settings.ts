import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Super Admin invoice “From” block. Empty string = not configured.
 * Do not seed fabricated GSTIN / seller identity.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_settings'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_settings"
        ADD COLUMN "billingBrandName" varchar(120) NOT NULL DEFAULT '',
        ADD COLUMN "billingLegalName" varchar(200) NOT NULL DEFAULT '',
        ADD COLUMN "billingTagline" varchar(200) NOT NULL DEFAULT '',
        ADD COLUMN "billingAddress" text NOT NULL DEFAULT '',
        ADD COLUMN "billingGstin" varchar(32) NOT NULL DEFAULT '',
        ADD COLUMN "billingEmail" varchar(255) NOT NULL DEFAULT '',
        ADD COLUMN "billingPhone" varchar(40) NOT NULL DEFAULT '',
        ADD COLUMN "billingWebsite" varchar(253) NOT NULL DEFAULT ''
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_settings"
        DROP COLUMN IF EXISTS "billingBrandName",
        DROP COLUMN IF EXISTS "billingLegalName",
        DROP COLUMN IF EXISTS "billingTagline",
        DROP COLUMN IF EXISTS "billingAddress",
        DROP COLUMN IF EXISTS "billingGstin",
        DROP COLUMN IF EXISTS "billingEmail",
        DROP COLUMN IF EXISTS "billingPhone",
        DROP COLUMN IF EXISTS "billingWebsite"
    `)
  }
}
