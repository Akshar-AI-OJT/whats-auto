import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Current marketing consent state on contacts (events remain the audit log).
 * Default false — WhatsApp marketing requires explicit opt-in.
 */
export default class extends BaseSchema {
  protected tableName = 'contacts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('marketingOptIn').notNullable().defaultTo(false)
      table.timestamp('optedOutAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE INDEX "contacts_org_marketing_opt_in"
        ON "contacts" ("organizationId", "marketingOptIn")
        WHERE "deletedAt" IS NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "contacts_org_marketing_opt_in"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('optedOutAt')
      table.dropColumn('marketingOptIn')
    })
  }
}
