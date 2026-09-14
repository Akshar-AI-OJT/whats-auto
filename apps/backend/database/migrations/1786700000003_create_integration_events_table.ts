import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tenant idempotency ledger for inbound integration events.
 * Insert only after org is bound via runWithTenant.
 */
export default class extends BaseSchema {
  protected tableName = 'integration_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('connectionId')
        .nullable()
        .references('integration_connections.id')
        .onDelete('set null')
      table.text('provider').notNullable()
      table.text('externalEventId').notNullable()
      table.text('eventType').notNullable()
      table.jsonb('payload').notNullable()
      table.text('status').notNullable().defaultTo('accepted')
      table.text('errorCode').nullable()
      table.timestamp('receivedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('processedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "integration_events"
        ADD CONSTRAINT "integration_events_provider_check"
        CHECK ("provider" IN ('shopenup', 'custom')),
        ADD CONSTRAINT "integration_events_status_check"
        CHECK ("status" IN ('accepted', 'processed', 'failed'))
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "integration_events_idempotency_unique"
        ON "integration_events" ("organizationId", "provider", "externalEventId")
    `)

    this.schema.raw(`
      CREATE INDEX "integration_events_org_type"
        ON "integration_events" ("organizationId", "eventType")
    `)

    this.schema.raw(`
      CREATE INDEX "integration_events_org_received"
        ON "integration_events" ("organizationId", "receivedAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "integration_events_accepted_received"
        ON "integration_events" ("receivedAt")
        WHERE "status" = 'accepted'
    `)

    this.schema.raw('ALTER TABLE "integration_events" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "integration_events" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "integration_events_tenant_isolation" ON "integration_events"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)

    this.schema.raw(`
      CREATE OR REPLACE FUNCTION list_stale_accepted_integration_events(
        p_older_than timestamptz,
        p_limit int
      )
      RETURNS SETOF integration_events
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT *
        FROM integration_events
        WHERE status = 'accepted'
          AND "receivedAt" < p_older_than
        ORDER BY "receivedAt" ASC
        LIMIT p_limit
      $$
    `)
  }

  async down() {
    this.schema.raw(
      `DROP FUNCTION IF EXISTS list_stale_accepted_integration_events(timestamptz, int)`
    )
    this.schema.raw(
      `DROP POLICY IF EXISTS "integration_events_tenant_isolation" ON "integration_events"`
    )
    this.schema.dropTable(this.tableName)
  }
}
