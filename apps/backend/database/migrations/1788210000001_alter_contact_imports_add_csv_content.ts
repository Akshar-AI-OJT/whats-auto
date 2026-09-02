import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Legacy optional column: early designs stored CSV inline. New imports use
 * `filePath` (Drive/S3 key) only; workers still accept csvContent as fallback.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_imports'

  async up() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'csvContent')
    if (hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.text('csvContent').nullable()
    })
  }

  async down() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'csvContent')
    if (!hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('csvContent')
    })
  }
}
