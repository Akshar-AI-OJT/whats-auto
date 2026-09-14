import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Generic org-scoped S3 inventory. media_assets (and later profile/imports/exports)
 * link here; do not store non-WhatsApp blobs only in media_assets.
 */
export default class extends BaseSchema {
  protected tableName = 'organization_storage_objects'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('storageKey').notNullable()
      table.string('storageDisk', 32).notNullable().defaultTo('s3')
      table.string('namespace', 64).notNullable()
      table.string('ownerType', 64).notNullable()
      table.uuid('ownerId').nullable()
      table.string('mimeType', 255).notNullable()
      table.bigInteger('sizeBytes').notNullable()
      table.string('checksum', 128).nullable()
      table.string('state', 32).notNullable().defaultTo('pending_upload')
      table.string('retentionPolicy', 64).notNullable()
      table.string('provenance', 64).notNullable().defaultTo('upload')
      table.smallint('keyVersion').notNullable().defaultTo(2)
      table.timestamp('deletedAt', { useTz: true }).nullable()
      table.timestamp('purgeAfter', { useTz: true }).nullable()
      table.timestamp('purgedAt', { useTz: true }).nullable()
      table.integer('deleteAttempts').notNullable().defaultTo(0)
      table.timestamp('lastDeleteErrorAt', { useTz: true }).nullable()
      table.text('lastDeleteError').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "organization_storage_objects"
        ADD CONSTRAINT "organization_storage_objects_state_check"
        CHECK ("state" IN ('pending_upload', 'ready', 'failed', 'deleted', 'purged'))
    `)

    this.schema.raw(`
      ALTER TABLE "organization_storage_objects"
        ADD CONSTRAINT "organization_storage_objects_namespace_check"
        CHECK ("namespace" IN (
          'media_library', 'campaigns', 'knowledge_base', 'ai',
          'profile', 'imports', 'exports', 'temp'
        ))
    `)

    this.schema.raw(`
      ALTER TABLE "organization_storage_objects"
        ADD CONSTRAINT "organization_storage_objects_retention_check"
        CHECK ("retentionPolicy" IN (
          'until_deleted', 'campaign_terminal_plus_30d', 'ai_30d',
          'import_7d', 'export_7d', 'temp_24h'
        ))
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "organization_storage_objects_storage_key_unique"
        ON "organization_storage_objects" ("storageKey")
    `)

    this.schema.raw(`
      CREATE INDEX "organization_storage_objects_org_state_created"
        ON "organization_storage_objects" ("organizationId", "state", "createdAt")
    `)

    this.schema.raw(`
      CREATE INDEX "organization_storage_objects_purge_after"
        ON "organization_storage_objects" ("purgeAfter")
        WHERE "state" = 'deleted' AND "purgeAfter" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE INDEX "organization_storage_objects_owner"
        ON "organization_storage_objects" ("ownerType", "ownerId")
        WHERE "ownerId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "organization_storage_objects"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.raw('ALTER TABLE "organization_storage_objects" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "organization_storage_objects" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "organization_storage_objects_tenant_isolation"
        ON "organization_storage_objects"
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
      `DROP POLICY IF EXISTS "organization_storage_objects_tenant_isolation" ON "organization_storage_objects"`
    )
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "organization_storage_objects"`)
    this.schema.raw(`DROP INDEX IF EXISTS "organization_storage_objects_owner"`)
    this.schema.raw(`DROP INDEX IF EXISTS "organization_storage_objects_purge_after"`)
    this.schema.raw(`DROP INDEX IF EXISTS "organization_storage_objects_org_state_created"`)
    this.schema.raw(`DROP INDEX IF EXISTS "organization_storage_objects_storage_key_unique"`)
    this.schema.raw(
      `ALTER TABLE "organization_storage_objects" DROP CONSTRAINT IF EXISTS "organization_storage_objects_retention_check"`
    )
    this.schema.raw(
      `ALTER TABLE "organization_storage_objects" DROP CONSTRAINT IF EXISTS "organization_storage_objects_namespace_check"`
    )
    this.schema.raw(
      `ALTER TABLE "organization_storage_objects" DROP CONSTRAINT IF EXISTS "organization_storage_objects_state_check"`
    )
    this.schema.dropTable(this.tableName)
  }
}
