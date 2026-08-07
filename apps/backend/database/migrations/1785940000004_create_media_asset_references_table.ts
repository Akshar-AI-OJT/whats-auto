import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Live protected references prevent soft-delete of Media Library assets
 * while attached to messages, drafts, campaigns, templates, etc.
 */
export default class extends BaseSchema {
  protected tableName = 'media_asset_references'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('mediaAssetId').notNullable().references('media_assets.id').onDelete('cascade')
      table.string('ownerType', 64).notNullable()
      table.uuid('ownerId').notNullable()
      table.timestamp('protectedUntil', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "media_asset_references"
        ADD CONSTRAINT "media_asset_references_owner_type_check"
        CHECK ("ownerType" IN (
          'message', 'draft', 'scheduled_message', 'campaign', 'template'
        ))
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "media_asset_references_owner_asset_unique"
        ON "media_asset_references" ("ownerType", "ownerId", "mediaAssetId")
    `)

    this.schema.raw(`
      CREATE INDEX "media_asset_references_asset_live"
        ON "media_asset_references" ("mediaAssetId", "protectedUntil")
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "media_asset_references"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.raw('ALTER TABLE "media_asset_references" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "media_asset_references" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "media_asset_references_tenant_isolation"
        ON "media_asset_references"
        USING (
          "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
        WITH CHECK (
          "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "media_asset_references_tenant_isolation" ON "media_asset_references"`
    )
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "media_asset_references"`)
    this.schema.raw(`DROP INDEX IF EXISTS "media_asset_references_asset_live"`)
    this.schema.raw(`DROP INDEX IF EXISTS "media_asset_references_owner_asset_unique"`)
    this.schema.raw(
      `ALTER TABLE "media_asset_references" DROP CONSTRAINT IF EXISTS "media_asset_references_owner_type_check"`
    )
    this.schema.dropTable(this.tableName)
  }
}
