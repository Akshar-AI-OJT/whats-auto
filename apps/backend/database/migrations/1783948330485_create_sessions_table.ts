import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.text('token').notNullable().unique()
      table.text('ipAddress')
      table.text('userAgent')
      table.timestamp('expiresAt', { useTz: true })
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.index(['userId'], 'idx_session_user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
