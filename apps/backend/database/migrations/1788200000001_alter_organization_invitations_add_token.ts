import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('organization_invitations', (table) => {
      table.uuid('userId').nullable().references('users.id').onDelete('CASCADE')
      table.text('tokenHash').nullable()
    })

    this.schema.raw(
      `CREATE UNIQUE INDEX organization_invitations_token_hash_unique
       ON "organization_invitations" ("tokenHash")
       WHERE "tokenHash" IS NOT NULL`
    )

    this.schema.raw(
      `ALTER TABLE "organization_invitations"
       DROP CONSTRAINT IF EXISTS "organization_invitations_status"`
    )

    this.schema.raw(
      `ALTER TABLE "organization_invitations"
       ADD CONSTRAINT "organization_invitations_status"
       CHECK ("status" IN ('pending', 'accepted', 'rejected', 'canceled', 'expired'))`
    )

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE "organization_invitations" SET "status" = 'expired' WHERE "status" = 'pending'`
      )
    })
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "organization_invitations_token_hash_unique"`)

    this.schema.alterTable('organization_invitations', (table) => {
      table.dropColumn('userId')
      table.dropColumn('tokenHash')
    })

    this.schema.raw(
      `ALTER TABLE "organization_invitations"
       DROP CONSTRAINT IF EXISTS "organization_invitations_status"`
    )

    this.schema.raw(
      `ALTER TABLE "organization_invitations"
       ADD CONSTRAINT "organization_invitations_status"
       CHECK ("status" IN ('pending', 'accepted', 'rejected', 'canceled'))`
    )
  }
}
