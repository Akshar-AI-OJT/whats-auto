import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('organization_members', (table) => {
      table.integer('permissionVersion').notNullable().defaultTo(1)
    })

    this.schema.alterTable('user_roles', (table) => {
      table.integer('permissionVersion').notNullable().defaultTo(1)
    })

    this.schema.raw(`
      ALTER TABLE "organization_members"
        ADD CONSTRAINT "organization_members_permission_version_positive"
        CHECK ("permissionVersion" > 0)
    `)

    this.schema.raw(`
      ALTER TABLE "user_roles"
        ADD CONSTRAINT "user_roles_permission_version_positive"
        CHECK ("permissionVersion" > 0)
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE "organization_members"
        DROP CONSTRAINT IF EXISTS "organization_members_permission_version_positive"
    `)

    this.schema.raw(`
      ALTER TABLE "user_roles"
        DROP CONSTRAINT IF EXISTS "user_roles_permission_version_positive"
    `)

    this.schema.alterTable('organization_members', (table) => {
      table.dropColumn('permissionVersion')
    })

    this.schema.alterTable('user_roles', (table) => {
      table.dropColumn('permissionVersion')
    })
  }
}
