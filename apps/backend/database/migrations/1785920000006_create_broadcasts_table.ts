import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Outbound WhatsApp marketing & utility campaigns / broadcasts per organization.
 */
export default class extends BaseSchema {
  protected tableName = 'broadcasts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.text('name').notNullable()
      table
        .uuid('whatsappConfigId')
        .nullable()
        .references('whatsapp_configs.id')
        .onDelete('set null')
      table
        .uuid('messageTemplateId')
        .nullable()
        .references('message_templates.id')
        .onDelete('set null')
      table.timestamp('scheduledAt', { useTz: true }).nullable()
      table.text('status').notNullable().defaultTo('draft') // draft | scheduled | sending | sent | failed
      table.integer('totalRecipients').notNullable().defaultTo(0)
      table.integer('sentCount').notNullable().defaultTo(0)
      table.integer('deliveredCount').notNullable().defaultTo(0)
      table.integer('readCount').notNullable().defaultTo(0)
      table.integer('repliedCount').notNullable().defaultTo(0)
      table.integer('failedCount').notNullable().defaultTo(0)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE INDEX "broadcasts_org_status_scheduled"
        ON "broadcasts" ("organizationId", "status", "scheduledAt")
    `)

    this.schema.raw(`
      CREATE INDEX "broadcasts_org_created_at"
        ON "broadcasts" ("organizationId", "createdAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "broadcasts_org_wa_config"
        ON "broadcasts" ("organizationId", "whatsappConfigId")
        WHERE "whatsappConfigId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "broadcasts"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.raw('ALTER TABLE "broadcasts" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "broadcasts" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "broadcasts_tenant_isolation" ON "broadcasts"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "broadcasts_tenant_isolation" ON "broadcasts"`)
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "broadcasts"`)
    this.schema.dropTable(this.tableName)
  }
}
