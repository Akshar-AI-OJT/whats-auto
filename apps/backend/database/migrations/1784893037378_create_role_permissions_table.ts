import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'role_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('roleId').notNullable().references('roles.id').onDelete('cascade')
      table.uuid('permissionId').notNullable().references('permissions.id').onDelete('cascade')
      table.unique(['roleId', 'permissionId'])
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
