import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-organization outbound mail configuration (SMTP or provider API).
 * One row per organization; secrets encrypted at rest.
 */
export default class extends BaseSchema {
  protected tableName = 'organization_smtp_configs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table
        .uuid('organizationId')
        .notNullable()
        .unique()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE')

      table.string('transport', 20).notNullable()
      table.string('providerPreset', 50).notNullable().defaultTo('custom')
      table.string('senderName', 255).notNullable()
      table.string('senderEmail', 255).notNullable()

      table.string('host', 255).nullable()
      table.integer('port').nullable()
      table.boolean('secure').nullable()
      table.string('username', 255).nullable()
      table.text('passwordEncrypted').nullable()
      table.text('apiKeyEncrypted').nullable()

      table.string('status', 50).notNullable().defaultTo('verified')
      table.timestamp('lastTestedAt', { useTz: true }).nullable()
      table.text('lastErrorMessage').nullable()

      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE INDEX "organization_smtp_configs_org_id"
        ON "organization_smtp_configs" ("organizationId")
    `)

    this.schema.raw('ALTER TABLE "organization_smtp_configs" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "organization_smtp_configs" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "organization_smtp_configs_tenant_isolation" ON "organization_smtp_configs"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "organization_smtp_configs_tenant_isolation" ON "organization_smtp_configs"`
    )
    this.schema.dropTable(this.tableName)
  }
}
