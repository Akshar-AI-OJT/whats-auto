import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Campaign-level template variable mapping rules.
 * Resolved per-recipient values stay on broadcast_recipients.variables.
 */
export default class extends BaseSchema {
  protected tableName = 'broadcasts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('variableMappings').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('variableMappings')
    })
  }
}
