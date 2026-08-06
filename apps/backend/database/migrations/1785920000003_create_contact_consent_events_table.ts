import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Opt-in and opt-out (STOP keyword / manual / csv) audit events per contact.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_consent_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('contactId').notNullable().references('contacts.id').onDelete('cascade')
      table.text('eventType').notNullable() // opt_in | opt_out
      table.text('source').notNullable() // csv | manual | keyword
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE INDEX "contact_consent_events_org_contact"
        ON "contact_consent_events" ("organizationId", "contactId")
    `)

    this.schema.raw('ALTER TABLE "contact_consent_events" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "contact_consent_events" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "contact_consent_events_tenant_isolation" ON "contact_consent_events"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "contact_consent_events_tenant_isolation" ON "contact_consent_events"`
    )
    this.schema.dropTable(this.tableName)
  }
}
