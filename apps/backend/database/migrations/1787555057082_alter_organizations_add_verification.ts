import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Org-level KYB status. `organizations.status` stays the active/inactive boolean.
 * Existing tenants are grandfathered to verified so later feature gates do not lock them.
 */
export default class extends BaseSchema {
  protected tableName = 'organizations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('verificationStatus', 30).notNullable().defaultTo('unverified')
      table.text('verificationRejectionReason').nullable()
      table.timestamp('verifiedAt', { useTz: true }).nullable()
      table.uuid('verifiedByUserId').nullable().references('users.id').onDelete('SET NULL')
    })

    this.schema.raw(`
      ALTER TABLE "organizations" DISABLE TRIGGER "trg_set_updated_at";
      UPDATE "organizations"
        SET "verificationStatus" = 'verified',
            "verifiedAt" = COALESCE("createdAt", now());
      ALTER TABLE "organizations" ENABLE TRIGGER "trg_set_updated_at";
    `)

    this.schema.raw(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_verification_status_check"
        CHECK ("verificationStatus" IN ('unverified', 'pending_review', 'verified', 'rejected'))
    `)

    this.schema.raw(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_verified_at_required_check"
        CHECK ("verificationStatus" <> 'verified' OR "verifiedAt" IS NOT NULL)
    `)

    this.schema.raw(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_rejection_reason_required_check"
        CHECK ("verificationStatus" <> 'rejected' OR "verificationRejectionReason" IS NOT NULL)
    `)

    this.schema.raw(`
      CREATE INDEX "organizations_verification_status_live"
        ON "organizations" ("verificationStatus")
        WHERE "deletedAt" IS NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "organizations_verification_status_live"`)
    this.schema.raw(
      `ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_rejection_reason_required_check"`
    )
    this.schema.raw(
      `ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_verified_at_required_check"`
    )
    this.schema.raw(
      `ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_verification_status_check"`
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('verifiedByUserId')
      table.dropColumn('verifiedAt')
      table.dropColumn('verificationRejectionReason')
      table.dropColumn('verificationStatus')
    })
  }
}
