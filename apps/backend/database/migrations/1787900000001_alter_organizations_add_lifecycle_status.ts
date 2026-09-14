import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Convert organizations.status from boolean to string enum:
 * pending_setup | active | suspended | false
 * Also drops lifecycleStatus if an earlier draft migration added it.
 */
export default class extends BaseSchema {
  protected tableName = 'organizations'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status DROP DEFAULT
      `)

      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status TYPE varchar(32)
          USING (
            CASE
              WHEN status IS TRUE THEN 'active'
              WHEN status IS FALSE THEN 'false'
              ELSE 'active'
            END
          )
      `)

      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status SET DEFAULT 'active',
          ALTER COLUMN status SET NOT NULL
      `)

      await db.rawQuery(`
        ALTER TABLE organizations DROP COLUMN IF EXISTS "lifecycleStatus"
      `)

      await db.rawQuery(`
        DROP INDEX IF EXISTS organizations_lifecycle_pending_created_at_idx
      `)

      await db.rawQuery(`
        CREATE INDEX organizations_status_pending_created_at_idx
        ON organizations (status, "createdAt")
        WHERE status = 'pending_setup' AND "deletedAt" IS NULL
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`DROP INDEX IF EXISTS organizations_status_pending_created_at_idx`)

      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status DROP DEFAULT
      `)

      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status TYPE boolean
          USING (
            CASE
              WHEN status = 'false' THEN false
              WHEN status = 'active' THEN true
              ELSE true
            END
          )
      `)

      await db.rawQuery(`
        ALTER TABLE organizations
          ALTER COLUMN status SET DEFAULT true,
          ALTER COLUMN status SET NOT NULL
      `)
    })
  }
}
