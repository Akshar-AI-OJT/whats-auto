import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Client create-idempotency for Inbox POST retries.
 * Distinct from providerMessageId (Meta wamid), which is null until Graph send succeeds.
 */
export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('clientIdempotencyKey').nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "messages_org_sender_client_idempotency_key_unique"
        ON "messages" ("organizationId", "senderId", "clientIdempotencyKey")
        WHERE "clientIdempotencyKey" IS NOT NULL
          AND "senderId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "messages_org_sender_client_idempotency_key_unique"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('clientIdempotencyKey')
    })
  }
}
