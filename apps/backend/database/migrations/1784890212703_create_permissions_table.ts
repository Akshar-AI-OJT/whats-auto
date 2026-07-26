import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.string('name', 100).notNullable().unique()
      table.string('module', 20).notNullable()
      table.string('action', 30).notNullable()
      table.string('description', 100).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
