import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('name').notNullable()
      table.text('firstname').notNullable()
      table.text('lastname').notNullable()
      table.text('image')
      table.string('email', 100).notNullable()
      table.boolean('emailVerified').notNullable().defaultTo(false)
      table.boolean('isActive').notNullable().defaultTo(true)
      table.boolean('isDeleted').notNullable().defaultTo(false)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('deletedAt', { useTz: true }).nullable()
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.uuid('updatedBy').nullable().references('users.id').onDelete('set null')
      table.check(
        `("isDeleted"= FALSE and "deletedAt" is NULL) or ("isDeleted" = TRUE AND "deletedAt" IS NOT NULL AND "isActive" = FALSE)`
      )
    })
    this.schema.raw(`
      CREATE UNIQUE INDEX "idx_user_email_live" ON "users" ("email")        
  WHERE "isDeleted" = false;
    `)
    this.schema.raw(`
      CREATE INDEX "idx_user_active" ON "users" ("isActive") WHERE "isDeleted" = false;
    `)
  }

  async down() {
    await this.db.rawQuery(`
      DROP INDEX IF EXISTS idx_user_active;
    `)
    await this.db.rawQuery(`
      DROP INDEX IF EXISTS idx_user_email_live;
      `)
    this.schema.dropTable(this.tableName)
  }
}
