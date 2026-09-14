import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Optional group description and active/inactive status on existing tags.
 * Additive only — does not recreate tags or touch contact_tags.
 */
export default class extends BaseSchema {
  protected tableName = 'tags'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('description').nullable()
      table.text('status').notNullable().defaultTo('active')
    })

    this.schema.raw(`
      ALTER TABLE "tags"
        ADD CONSTRAINT "tags_status_check"
        CHECK ("status" IN ('active', 'inactive'))
    `)
  }

  async down() {
    this.schema.raw(`ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_status_check"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('status')
      table.dropColumn('description')
    })
  }
}
