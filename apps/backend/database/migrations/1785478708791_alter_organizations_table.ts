import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_members'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('isDeleted').notNullable().defaultTo(false)
      table.timestamp('deletedAt', { useTz: true }).nullable()
      table.dropUnique(['organizationId', 'userId'])
    })
    this.schema.raw(`
      ALTER TABLE "${this.tableName}"
      ADD CONSTRAINT "chk_org_members_deleted"
      CHECK (("isDeleted" = FALSE AND "deletedAt" IS NULL) OR ("isDeleted" = TRUE AND "deletedAt" IS NOT NULL))
      `)
    this.schema.raw(`
        CREATE UNIQUE INDEX "organization_members_org_user_live"
        ON "${this.tableName}" ("organizationId", "userId")
        WHERE "isDeleted" = false
      `)
    this.schema.raw(`
        CREATE INDEX "organization_members_active_org"
        ON "${this.tableName}" ("organizationId")
        WHERE "isDeleted" = false
      `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "organization_members_active_org"`)
    this.schema.raw(`DROP INDEX IF EXISTS "organization_members_org_user_live"`)
    this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS
  "chk_org_members_deleted"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['organizationId', 'userId'])
      table.dropColumn('deletedAt')
      table.dropColumn('isDeleted')
    })
  }
}
