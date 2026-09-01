import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Persist the uploaded CSV so the contact-import worker can process rows
 * without putting the file in the queue payload.
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
