import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Outbound dispatch schema (outbound.md Phase 1):
 * - message_templates.parameterSchema for named template variables
 * - outbound_dispatches durable queue / lease rows (1:1 with messages)
 * - unmatched_provider_receipts early-receipt buffer keyed by org + wamid
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('message_templates', (table) => {
      table.jsonb('parameterSchema').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
    })

    this.schema.createTable('outbound_dispatches', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('whatsappConfigId')
        .notNullable()
        .references('whatsapp_configs.id')
        .onDelete('cascade')
      table.uuid('messageId').notNullable().references('messages.id').onDelete('cascade')
      table.text('status').notNullable().defaultTo('pending')
      // pending | processing | sent | retry_scheduled | failed
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('nextAttemptAt', { useTz: true }).nullable()
      table.text('lockOwner').nullable()
      table.timestamp('lockedAt', { useTz: true }).nullable()
      table.timestamp('lockExpiresAt', { useTz: true }).nullable()
      table.jsonb('payload').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.text('errorMessage').nullable()
      table.text('errorCode').nullable()
      table.timestamp('completedAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()

      table.unique(['messageId'], { indexName: 'outbound_dispatches_message_id_unique' })
    })

    this.schema.raw(`
      ALTER TABLE "outbound_dispatches"
        ADD CONSTRAINT "outbound_dispatches_status_check"
        CHECK ("status" IN ('pending', 'processing', 'sent', 'retry_scheduled', 'failed'))
    `)

    this.schema.raw(`
      ALTER TABLE "outbound_dispatches"
        ADD CONSTRAINT "outbound_dispatches_attempts_non_negative"
        CHECK ("attempts" >= 0)
    `)

    this.schema.raw(`
      CREATE INDEX "outbound_dispatches_org_status_next_attempt"
        ON "outbound_dispatches" ("organizationId", "status", "nextAttemptAt")
    `)

    this.schema.raw(`
      CREATE INDEX "outbound_dispatches_org_config_status"
        ON "outbound_dispatches" ("organizationId", "whatsappConfigId", "status")
    `)

    this.schema.raw(`
      CREATE INDEX "outbound_dispatches_lock_expires"
        ON "outbound_dispatches" ("lockExpiresAt")
        WHERE "status" = 'processing' AND "lockExpiresAt" IS NOT NULL
    `)

    this.schema.raw('ALTER TABLE "outbound_dispatches" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "outbound_dispatches" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "outbound_dispatches_tenant_isolation" ON "outbound_dispatches"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "outbound_dispatches"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    this.schema.createTable('unmatched_provider_receipts', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table
        .uuid('whatsappConfigId')
        .notNullable()
        .references('whatsapp_configs.id')
        .onDelete('cascade')
      table.text('providerMessageId').notNullable()
      table.text('status').notNullable() // sent | delivered | read | failed
      table.timestamp('providerStatusAt', { useTz: true }).notNullable()
      table.text('errorMessage').nullable()
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.timestamp('receivedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table
        .timestamp('expiresAt', { useTz: true })
        .notNullable()
        .defaultTo(this.raw(`now() + interval '30 days'`))
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()

      table.unique(['organizationId', 'providerMessageId'], {
        indexName: 'unmatched_provider_receipts_org_wamid_unique',
      })
    })

    this.schema.raw(`
      ALTER TABLE "unmatched_provider_receipts"
        ADD CONSTRAINT "unmatched_provider_receipts_status_check"
        CHECK ("status" IN ('sent', 'delivered', 'read', 'failed'))
    `)

    this.schema.raw(`
      CREATE INDEX "unmatched_provider_receipts_org_expires"
        ON "unmatched_provider_receipts" ("organizationId", "expiresAt")
    `)

    this.schema.raw(`
      CREATE INDEX "unmatched_provider_receipts_config_wamid"
        ON "unmatched_provider_receipts" ("whatsappConfigId", "providerMessageId")
    `)

    this.schema.raw('ALTER TABLE "unmatched_provider_receipts" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "unmatched_provider_receipts" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "unmatched_provider_receipts_tenant_isolation" ON "unmatched_provider_receipts"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "unmatched_provider_receipts"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)
  }

  async down() {
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "unmatched_provider_receipts"`)
    this.schema.raw(
      `DROP POLICY IF EXISTS "unmatched_provider_receipts_tenant_isolation" ON "unmatched_provider_receipts"`
    )
    this.schema.dropTable('unmatched_provider_receipts')

    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "outbound_dispatches"`)
    this.schema.raw(
      `DROP POLICY IF EXISTS "outbound_dispatches_tenant_isolation" ON "outbound_dispatches"`
    )
    this.schema.dropTable('outbound_dispatches')

    this.schema.alterTable('message_templates', (table) => {
      table.dropColumn('parameterSchema')
    })
  }
}
