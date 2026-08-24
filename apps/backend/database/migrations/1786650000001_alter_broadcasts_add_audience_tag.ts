import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Persist the campaign's customer group (tag) so launch/relaunch
 * can re-resolve live membership instead of a one-off contact snapshot.
 */
export default class extends BaseSchema {
  protected tableName = 'broadcasts'

  async up() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'audienceTagId')
    if (hasColumn) return

    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('audienceTagId').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('audienceTagId')
    })
  }
}
