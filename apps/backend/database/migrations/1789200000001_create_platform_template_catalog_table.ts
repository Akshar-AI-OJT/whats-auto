import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Landlord template designs (Meta Library imports + manual). No organizationId, no RLS.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_template_catalog'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('slug').notNullable()
      table.text('name').notNullable()
      table.text('category').notNullable()
      table.text('language').notNullable()
      table.text('headerType').nullable()
      table.text('headerContent').nullable()
      table.text('bodyText').notNullable()
      table.text('footerText').nullable()
      table.jsonb('buttons').nullable()
      table.jsonb('sampleValues').nullable()
      table.jsonb('parameterSchema').nullable()
      table.text('libraryTemplateName').nullable()
      table.text('libraryTopic').nullable()
      table.text('libraryUsecase').nullable()
      table.text('libraryIndustry').nullable()
      table.text('source').notNullable().defaultTo('MANUAL')
      table.text('status').notNullable().defaultTo('DRAFT')
      table.integer('sortOrder').notNullable().defaultTo(0)
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.uuid('updatedByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "platform_template_catalog"
        ADD CONSTRAINT "platform_template_catalog_source_check"
        CHECK ("source" IN ('META_LIBRARY', 'MANUAL'))
    `)
    this.schema.raw(`
      ALTER TABLE "platform_template_catalog"
        ADD CONSTRAINT "platform_template_catalog_status_check"
        CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
    `)
    this.schema.raw(`
      CREATE UNIQUE INDEX "platform_template_catalog_slug_unique"
        ON "platform_template_catalog" ("slug")
    `)
    this.schema.raw(`
      CREATE UNIQUE INDEX "platform_template_catalog_library_name_language_unique"
        ON "platform_template_catalog" ("libraryTemplateName", "language")
        WHERE "libraryTemplateName" IS NOT NULL
    `)
    this.schema.raw(`
      CREATE INDEX "platform_template_catalog_status_category_language"
        ON "platform_template_catalog" ("status", "category", "language")
    `)
    this.schema.raw(`
      CREATE INDEX "platform_template_catalog_library_industry"
        ON "platform_template_catalog" ("libraryIndustry")
        WHERE "libraryIndustry" IS NOT NULL
    `)
    this.schema.raw(`
      CREATE INDEX "platform_template_catalog_library_topic"
        ON "platform_template_catalog" ("libraryTopic")
        WHERE "libraryTopic" IS NOT NULL
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "platform_template_catalog"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)
  }

  async down() {
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "platform_template_catalog"`)
    this.schema.dropTable(this.tableName)
  }
}
