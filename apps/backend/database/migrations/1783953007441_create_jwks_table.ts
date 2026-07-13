import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'jwks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('publicKey').notNullable()
      table.text('privateKey').notNullable()
      table.text('alg')
      table.text('crv')
      table.timestamp('expiresAt', { useTz: true })
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
