import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-contact delivery tracking and variable values for broadcast campaigns.
 */
export default class extends BaseSchema {
  protected tableName = 'broadcast_recipients'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('broadcastId').notNullable().references('broadcasts.id').onDelete('cascade')
      table.uuid('contactId').notNullable().references('contacts.id').onDelete('cascade')
      table.text('status').notNullable().defaultTo('pending') // pending | queued | sent | delivered | read | failed
      table.jsonb('variables').nullable() // template parameter values per recipient
      table.uuid('messageId').nullable().unique().references('messages.id').onDelete('set null')
      table.text('errorMessage').nullable()
      table.timestamp('sentAt', { useTz: true }).nullable()
      table.timestamp('deliveredAt', { useTz: true }).nullable()
      table.timestamp('readAt', { useTz: true }).nullable()
      table.timestamp('repliedAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "broadcast_recipients_broadcast_contact_unique"
        ON "broadcast_recipients" ("broadcastId", "contactId")
    `)

    this.schema.raw(`
      CREATE INDEX "broadcast_recipients_org_broadcast_status"
        ON "broadcast_recipients" ("organizationId", "broadcastId", "status")
    `)

    this.schema.raw('ALTER TABLE "broadcast_recipients" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "broadcast_recipients" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "broadcast_recipients_tenant_isolation" ON "broadcast_recipients"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "broadcast_recipients_tenant_isolation" ON "broadcast_recipients"`
    )
    this.schema.dropTable(this.tableName)
  }
}
