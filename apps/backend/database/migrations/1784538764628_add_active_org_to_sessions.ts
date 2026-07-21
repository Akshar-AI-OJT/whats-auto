import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('sessions', (table) => {
      table
        .uuid('activeOrganizationId')
        .nullable()
        .references('organizations.id')
        .onDelete('set null')
    })
    this.schema.raw(
      `CREATE INDEX "sessions_active_organization" on "sessions" ("activeOrganizationId")`
    )
  }

  async down() {
    this.schema.alterTable('sessions', (table) => {
      table.dropColumn('activeOrganizationId')
    })
  }
}
