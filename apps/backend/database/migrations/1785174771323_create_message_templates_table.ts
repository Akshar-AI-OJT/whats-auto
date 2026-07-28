import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Meta-approved (and draft) WhatsApp message templates per organization.
 */
export default class extends BaseSchema {
  protected tableName = 'message_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('whatsappConfigId')
        .nullable()
        .references('whatsapp_configs.id')
        .onDelete('set null')
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.text('name').notNullable()
      table.text('category').notNullable() // marketing | utility | authentication
      table.text('language').nullable()
      table.text('headerType').nullable() // none | text | image | video | document
      table.text('headerContent').nullable()
      table.text('headerMediaUrl').nullable()
      table.text('bodyText').notNullable()
      table.text('footerText').nullable()
      table.jsonb('buttons').nullable()
      table.jsonb('sampleValues').nullable()
      table.text('status').notNullable().defaultTo('draft') // draft | pending | approved | rejected | deleted | paused | disabled
      table.text('metaTemplateId').nullable()
      table.text('rejectionReason').nullable()
      table.text('qualityScore').nullable()
      table.text('submissionError').nullable()
      table.timestamp('lastSubmittedAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    // Meta template name is unique per org + language (NULL language treated as '').
    this.schema.raw(`
      CREATE UNIQUE INDEX "message_templates_org_name_language_unique"
        ON "message_templates" ("organizationId", "name", (COALESCE("language", '')))
    `)

    this.schema.raw(`
      CREATE INDEX "message_templates_org_status_name"
        ON "message_templates" ("organizationId", "status", "name")
    `)

    this.schema.raw(`
      CREATE INDEX "message_templates_org_wa_config"
        ON "message_templates" ("organizationId", "whatsappConfigId")
        WHERE "whatsappConfigId" IS NOT NULL
    `)

    this.schema.raw('ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "message_templates_tenant_isolation" ON "message_templates"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "message_templates_tenant_isolation" ON "message_templates"`
    )
    this.schema.dropTable(this.tableName)
  }
}
