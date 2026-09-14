import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One connected third-party store per tenant+provider (v1: shopenup | custom).
 * Secrets live in encryptedSecret, never in config jsonb.
 */
export default class extends BaseSchema {
  protected tableName = 'integration_connections'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('provider').notNullable()
      table.text('externalAccountId').nullable()
      table.text('displayName').notNullable()
      table.text('encryptedSecret').nullable()
      table.jsonb('config').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.text('status').notNullable().defaultTo('connected')
      table.timestamp('lastSyncAt', { useTz: true }).nullable()
      table.text('lastErrorCode').nullable()
      table.text('lastErrorMessage').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "integration_connections"
        ADD CONSTRAINT "integration_connections_provider_check"
        CHECK ("provider" IN ('shopenup', 'custom')),
        ADD CONSTRAINT "integration_connections_status_check"
        CHECK ("status" IN ('connected', 'disconnected', 'error'))
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "integration_connections_org_provider_unique"
        ON "integration_connections" ("organizationId", "provider")
    `)

    this.schema.raw('ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "integration_connections_tenant_isolation" ON "integration_connections"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "integration_connections_tenant_isolation" ON "integration_connections"`
    )
    this.schema.dropTable(this.tableName)
  }
}
