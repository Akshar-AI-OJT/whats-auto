import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Campaign execution metadata / header media on broadcasts.
 * One-off message scheduling is intentionally not supported — use campaigns.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "broadcasts"
        ADD COLUMN IF NOT EXISTS "headerMediaAssetId" uuid NULL
          REFERENCES "media_assets" ("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "finalizedAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz NULL
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "broadcasts_org_header_media"
        ON "broadcasts" ("organizationId", "headerMediaAssetId")
        WHERE "headerMediaAssetId" IS NOT NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "broadcasts_org_header_media"`)
    await this.db.rawQuery(`
      ALTER TABLE "broadcasts"
        DROP COLUMN IF EXISTS "cancelledAt",
        DROP COLUMN IF EXISTS "finalizedAt",
        DROP COLUMN IF EXISTS "headerMediaAssetId"
    `)
  }
}
