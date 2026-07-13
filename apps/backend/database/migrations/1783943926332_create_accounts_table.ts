import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.text('accountId').notNullable()
      table.text('providerId').notNullable()
      table.text('password').nullable() // null for Google OAuth / magic-link accounts
      table.text('accessToken')
      table.text('refreshToken')
      table.text('idToken')
      table.timestamp('accessTokenExpiresAt', { useTz: true })
      table.timestamp('refreshTokenExpiresAt', { useTz: true })
      table.text('scope').nullable()
      table.timestamp('createdAt', { useTz: true }).defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.unique(['accountId', 'providerId'], {
        indexName: 'accounts_accountid_providerid_unique',
      })
      table.index(['userId'], 'idx_account_user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
