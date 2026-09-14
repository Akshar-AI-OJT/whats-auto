import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Primary storage for contact-import CSVs: Drive/S3 object key under
 * organizations/{organizationId}/imports/contacts/. The worker reads this
 * file instead of the HTTP tmp upload (preferred over legacy csvContent).
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
