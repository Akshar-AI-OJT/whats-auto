import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Link WhatsApp/media-domain rows to generic storage inventory.
 * Legacy rows keep storageObjectId NULL; new uploads always set it.
 */
export default class extends BaseSchema {
  protected tableName = 'media_assets'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        ADD COLUMN "storageObjectId" uuid NULL
          REFERENCES "organization_storage_objects" ("id") ON DELETE SET NULL
    `)

    await this.db.rawQuery(`
      CREATE UNIQUE INDEX "media_assets_storage_object_id_unique"
        ON "media_assets" ("storageObjectId")
        WHERE "storageObjectId" IS NOT NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "media_assets_storage_object_id_unique"`)
    await this.db.rawQuery(`
      ALTER TABLE "media_assets"
        DROP COLUMN IF EXISTS "storageObjectId"
    `)
  }
}
