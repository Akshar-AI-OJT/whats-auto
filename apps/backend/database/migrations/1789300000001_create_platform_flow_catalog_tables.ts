import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Landlord conversation-flow designs. No organizationId, no RLS.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_flow_catalog'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('slug').notNullable()
      table.string('name', 255).notNullable()
      table.text('description').nullable()
      table.string('status', 50).notNullable().defaultTo('DRAFT')
      table.uuid('publishedVersionId').nullable()
      table.string('triggerType', 50).notNullable().defaultTo('KEYWORD')
      table.jsonb('triggerConfig').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.jsonb('settings').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table
        .jsonb('requiredFeatureKeys')
        .notNullable()
        .defaultTo(this.raw(`'["flowBuilder"]'::jsonb`))
      table.jsonb('extraRequiredFeatureKeys').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.integer('sortOrder').notNullable().defaultTo(0)
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.uuid('updatedByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.createTable('platform_flow_catalog_versions', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table
        .uuid('flowCatalogId')
        .notNullable()
        .references('id')
        .inTable('platform_flow_catalog')
        .onDelete('cascade')
      table.integer('versionNumber').notNullable().defaultTo(1)
      table.jsonb('nodes').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.jsonb('edges').notNullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.jsonb('viewport').nullable().defaultTo(this.raw(`'{"x":0,"y":0,"zoom":1}'::jsonb`))
      table.string('validationStatus', 50).notNullable().defaultTo('VALID')
      table.jsonb('validationErrors').nullable().defaultTo(this.raw(`'[]'::jsonb`))
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "platform_flow_catalog"
        ADD CONSTRAINT "platform_flow_catalog_status_check"
        CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
    `)
    this.schema.raw(`
      CREATE UNIQUE INDEX "platform_flow_catalog_slug_unique"
        ON "platform_flow_catalog" ("slug")
    `)
    this.schema.raw(`
      CREATE INDEX "platform_flow_catalog_status"
        ON "platform_flow_catalog" ("status")
    `)
    this.schema.raw(`
      ALTER TABLE "platform_flow_catalog_versions"
        ADD CONSTRAINT "platform_flow_catalog_versions_unique"
        UNIQUE ("flowCatalogId", "versionNumber")
    `)
    this.schema.raw(`
      ALTER TABLE "platform_flow_catalog"
        ADD CONSTRAINT "platform_flow_catalog_published_version_fk"
        FOREIGN KEY ("publishedVersionId")
        REFERENCES "platform_flow_catalog_versions" ("id")
        ON DELETE SET NULL
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "platform_flow_catalog"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)
  }

  async down() {
    this.schema.raw(
      `ALTER TABLE "platform_flow_catalog" DROP CONSTRAINT IF EXISTS "platform_flow_catalog_published_version_fk"`
    )
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "platform_flow_catalog"`)
    this.schema.dropTable('platform_flow_catalog_versions')
    this.schema.dropTable(this.tableName)
  }
}
