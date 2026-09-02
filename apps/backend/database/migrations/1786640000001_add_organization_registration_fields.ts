import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Organization master-data fields collected during organization registration.
 * Columns are nullable so existing organizations remain readable/writable;
 * create-organization validation requires them for new tenants.
 */
export default class extends BaseSchema {
  protected tableName = 'organizations'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "organizationType" varchar(32) NULL,
        ADD COLUMN IF NOT EXISTS "address" text NULL,
        ADD COLUMN IF NOT EXISTS "pan" varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS "gstin" varchar(15) NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_organization_type_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_organization_type_check"
        CHECK (
          "organizationType" IS NULL
          OR "organizationType" IN ('company', 'partnership', 'sole_proprietorship', 'other')
        )
    `)

    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_pan_format_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_pan_format_check"
        CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
    `)

    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_gstin_format_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_gstin_format_check"
        CHECK (
          "gstin" IS NULL
          OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
        )
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_gstin_format_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_pan_format_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_organization_type_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "organizations"
        DROP COLUMN IF EXISTS "gstin",
        DROP COLUMN IF EXISTS "pan",
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "organizationType"
    `)
  }
}
