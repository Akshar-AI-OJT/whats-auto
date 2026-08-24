import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Persist the ISO 3166-1 alpha-2 default country for national CSV phone cells.
 * columnMapping stays field→header mapping only.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_imports'

  async up() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'defaultCountryCode')
    if (hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.string('defaultCountryCode', 2).nullable()
    })
  }

  async down() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'defaultCountryCode')
    if (!hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('defaultCountryCode')
    })
  }
}
