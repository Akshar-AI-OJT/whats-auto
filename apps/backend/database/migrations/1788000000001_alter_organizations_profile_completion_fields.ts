import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Organization profile completion fields + structured address JSONB.
 * Also adds optional designation on organization_members (owner/admin title).
 *
 * Address migration: free-text `address` is rewritten into
 * `{ addressLine1, addressLine2, city, state, postalCode, country }`
 * with the previous string preserved in `addressLine1` and org `country`
 * copied into the JSON `country` field when available.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE "organizations"
          ADD COLUMN IF NOT EXISTS "description" text NULL,
          ADD COLUMN IF NOT EXISTS "businessSize" varchar(64) NULL,
          ADD COLUMN IF NOT EXISTS "alternatePhone" varchar(100) NULL,
          ADD COLUMN IF NOT EXISTS "defaultLanguage" varchar(16) NULL,
          ADD COLUMN IF NOT EXISTS "businessRegistrationNumber" varchar(64) NULL
      `)

      await db.rawQuery(`
        ALTER TABLE "organizations"
          ALTER COLUMN "address" TYPE jsonb
          USING (
            CASE
              WHEN "address" IS NULL OR btrim("address") = '' THEN NULL
              WHEN "address" ~ '^\\s*\\{' THEN "address"::jsonb
              ELSE jsonb_build_object(
                'addressLine1', "address",
                'addressLine2', NULL,
                'city', NULL,
                'state', NULL,
                'postalCode', NULL,
                'country', "country"
              )
            END
          )
      `)

      await db.rawQuery(`
        ALTER TABLE "organization_members"
          ADD COLUMN IF NOT EXISTS "designation" varchar(120) NULL
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE "organization_members"
          DROP COLUMN IF EXISTS "designation"
      `)

      await db.rawQuery(`
        ALTER TABLE "organizations"
          ALTER COLUMN "address" TYPE text
          USING (
            CASE
              WHEN "address" IS NULL THEN NULL
              ELSE NULLIF(
                btrim(
                  concat_ws(
                    ', ',
                    NULLIF("address"->>'addressLine1', ''),
                    NULLIF("address"->>'addressLine2', ''),
                    NULLIF("address"->>'city', ''),
                    NULLIF("address"->>'state', ''),
                    NULLIF("address"->>'postalCode', ''),
                    NULLIF("address"->>'country', '')
                  )
                ),
                ''
              )
            END
          )
      `)

      await db.rawQuery(`
        ALTER TABLE "organizations"
          DROP COLUMN IF EXISTS "businessRegistrationNumber",
          DROP COLUMN IF EXISTS "defaultLanguage",
          DROP COLUMN IF EXISTS "alternatePhone",
          DROP COLUMN IF EXISTS "businessSize",
          DROP COLUMN IF EXISTS "description"
      `)
    })
  }
}
