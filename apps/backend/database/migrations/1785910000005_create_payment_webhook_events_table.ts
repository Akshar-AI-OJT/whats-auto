import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payment_webhook_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('provider').notNullable()
      table.text('eventId').notNullable()
      table.text('eventType').notNullable()
      table.uuid('organizationId').nullable().references('organizations.id').onDelete('set null')
      table.jsonb('payload').notNullable()
      table.text('status').notNullable().defaultTo('pending')
      table.text('processingError').nullable()
      table.timestamp('processedAt', { useTz: true }).nullable()
      table.integer('retryCount').notNullable().defaultTo(0)
      table.timestamp('nextAttemptAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('lockedAt', { useTz: true }).nullable()
      table.timestamp('lockExpiresAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      ALTER TABLE "payment_webhook_events"
        ADD CONSTRAINT "payment_webhook_events_status_check"
        CHECK ("status" IN ('pending', 'processing', 'processed', 'ignored', 'failed')),
        ADD CONSTRAINT "payment_webhook_events_retry_count_non_negative"
        CHECK ("retryCount" >= 0)
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_unique"
        ON "payment_webhook_events" ("provider", "eventId")
    `)

    this.schema.raw(`
      CREATE INDEX "payment_webhook_events_status_next_attempt"
        ON "payment_webhook_events" ("status", "nextAttemptAt")
    `)

    this.schema.raw(`
      CREATE INDEX "payment_webhook_events_lock_expires"
        ON "payment_webhook_events" ("lockExpiresAt")
        WHERE "status" = 'processing' AND "lockExpiresAt" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE INDEX "payment_webhook_events_org_created_at"
        ON "payment_webhook_events" ("organizationId", "createdAt" DESC)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
