import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Evolve media_assets into an org media library with private storage keys,
 * CDN delivery URLs, and upload lifecycle state. No production backfill required;
 * existing rows (demo/tests) are stamped READY with a derived storageKey.
 *
 * Uses raw SQL so ADD COLUMN completes before the backfill UPDATE (Lucid
 * schema builders are deferred and would race with mid-migration rawQuery).
 */
export default class extends BaseSchema {
  protected tableName = 'media_assets'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        ADD COLUMN "storageDisk" varchar(32) NULL,
        ADD COLUMN "storageKey" text NULL,
        ADD COLUMN "deliveryUrl" text NULL,
        ADD COLUMN "state" text NULL,
        ADD COLUMN "source" text NULL,
        ADD COLUMN "checksum" varchar(128) NULL,
        ADD COLUMN "createdAt" timestamptz NULL,
        ADD COLUMN "updatedAt" timestamptz NULL
    `)

    await this.db.rawQuery(`
      UPDATE "media_assets"
      SET
        "storageDisk" = COALESCE("storageDisk", 's3'),
        "storageKey" = COALESCE(
          "storageKey",
          "organizationId"::text || '/upload/legacy/' || "id"::text
        ),
        "deliveryUrl" = COALESCE("deliveryUrl", "filePath"),
        "state" = COALESCE("state", 'ready'),
        "source" = COALESCE("source", 'upload'),
        "createdAt" = COALESCE("createdAt", "uploadedAt"),
        "updatedAt" = COALESCE("updatedAt", "uploadedAt")
    `)

    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        ALTER COLUMN "storageDisk" SET NOT NULL,
        ALTER COLUMN "storageKey" SET NOT NULL,
        ALTER COLUMN "deliveryUrl" SET NOT NULL,
        ALTER COLUMN "state" SET NOT NULL,
        ALTER COLUMN "source" SET NOT NULL,
        ALTER COLUMN "createdAt" SET NOT NULL,
        ALTER COLUMN "updatedAt" SET NOT NULL,
        ALTER COLUMN "storageDisk" SET DEFAULT 's3',
        ALTER COLUMN "state" SET DEFAULT 'ready',
        ALTER COLUMN "source" SET DEFAULT 'upload',
        ALTER COLUMN "createdAt" SET DEFAULT now(),
        ALTER COLUMN "updatedAt" SET DEFAULT now()
    `)

    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        ADD CONSTRAINT "media_assets_state_check"
        CHECK ("state" IN ('pending_upload', 'ready', 'failed', 'deleted'))
    `)

    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        ADD CONSTRAINT "media_assets_source_check"
        CHECK ("source" IN ('upload', 'inbound', 'system'))
    `)

    await this.db.rawQuery(`
      CREATE UNIQUE INDEX "media_assets_storage_key_unique"
        ON "media_assets" ("storageKey")
    `)

    await this.db.rawQuery(`
      CREATE INDEX "media_assets_org_state_created"
        ON "media_assets" ("organizationId", "state", "createdAt")
    `)

    await this.db.rawQuery(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "media_assets"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "media_assets"`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS "media_assets_org_state_created"`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS "media_assets_storage_key_unique"`)
    await this.db.rawQuery(
      `ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_source_check"`
    )
    await this.db.rawQuery(
      `ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_state_check"`
    )
    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        DROP COLUMN IF EXISTS "updatedAt",
        DROP COLUMN IF EXISTS "createdAt",
        DROP COLUMN IF EXISTS "checksum",
        DROP COLUMN IF EXISTS "source",
        DROP COLUMN IF EXISTS "state",
        DROP COLUMN IF EXISTS "deliveryUrl",
        DROP COLUMN IF EXISTS "storageKey",
        DROP COLUMN IF EXISTS "storageDisk"
    `)
  }
}
