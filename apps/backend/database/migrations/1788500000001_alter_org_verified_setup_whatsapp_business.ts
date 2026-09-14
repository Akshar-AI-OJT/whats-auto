import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * D70 Phase 1:
 * - Extend unpaid org index to cover verified_setup (varchar status; no CHECK to alter)
 * - Persist Meta business portfolio id + verification snapshot on whatsapp_configs
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        DROP INDEX IF EXISTS organizations_status_pending_created_at_idx
      `)

      await db.rawQuery(`
        CREATE INDEX organizations_status_pending_verified_created_at_idx
        ON organizations (status, "createdAt")
        WHERE status IN ('pending_setup', 'verified_setup') AND "deletedAt" IS NULL
      `)
    })

    this.schema.alterTable('whatsapp_configs', (table) => {
      table.text('businessId').nullable()
      table.text('metaVerificationStatus').nullable()
    })
  }

  async down() {
    this.schema.alterTable('whatsapp_configs', (table) => {
      table.dropColumn('businessId')
      table.dropColumn('metaVerificationStatus')
    })

    this.defer(async (db) => {
      await db.rawQuery(`
        DROP INDEX IF EXISTS organizations_status_pending_verified_created_at_idx
      `)

      await db.rawQuery(`
        CREATE INDEX organizations_status_pending_created_at_idx
        ON organizations (status, "createdAt")
        WHERE status = 'pending_setup' AND "deletedAt" IS NULL
      `)
    })
  }
}
