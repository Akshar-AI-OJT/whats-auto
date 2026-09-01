import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('graceEndsAt', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('graceEndsAt')
    })
  }
}
