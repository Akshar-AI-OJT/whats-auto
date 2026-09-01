import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Persistent Drive/S3 object key for the uploaded Contact Import CSV.
 * The worker reads this file instead of the HTTP tmp upload.
 */
export default class extends BaseSchema {
  protected tableName = 'contact_imports'

  async up() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'filePath')
    if (hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.text('filePath').nullable()
    })
  }

  async down() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'filePath')
    if (!hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('filePath')
    })
  }
}
