import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * In-app notifications for agents (org-scoped).
 */
export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.text('type').notNullable()
      table.uuid('conversationId').nullable().references('conversations.id').onDelete('set null')
      table.uuid('contactId').nullable().references('contacts.id').onDelete('set null')
      table.uuid('actorUserId').nullable().references('users.id').onDelete('set null')
      table.text('title').notNullable()
      table.text('body').nullable()
      table.timestamp('readAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
