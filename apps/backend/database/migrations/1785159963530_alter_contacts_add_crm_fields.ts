import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Widen stub `contacts` toward CRM shape used by WhatsApp inbox upserts.
 * @see schema_columns_by_module.md — CRM.contacts
 */
export default class extends BaseSchema {
  protected tableName = 'contacts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('phoneNormalized').notNullable()
      table.string('name', 255).nullable()
      table.string('email', 255).nullable()
      table.string('company', 255).nullable()
      table.jsonb('customFields').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('deletedAt', { useTz: true }).nullable()
    })
    this.schema.raw(`
      CREATE UNIQUE INDEX "contacts_org_phone_normalized_unique"
        ON "contacts" ("organizationId", "phoneNormalized")
        WHERE "deletedAt" IS NULL
    `)

    this.schema.raw(`
      CREATE INDEX "contacts_org_created_at"
        ON "contacts" ("organizationId", "createdAt" DESC)
    `)

    this.schema.raw(`
      CREATE INDEX "contacts_org_email"
        ON "contacts" ("organizationId", "email")
        WHERE "email" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "contacts_org_email"`)
    this.schema.raw(`DROP INDEX IF EXISTS "contacts_org_created_at"`)
    this.schema.raw(`DROP INDEX IF EXISTS "contacts_org_phone_normalized_unique"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deletedAt')
      table.dropColumn('createdByUserId')
      table.dropColumn('customFields')
      table.dropColumn('company')
      table.dropColumn('email')
      table.dropColumn('name')
      table.dropColumn('phoneNormalized')
    })
  }
}
