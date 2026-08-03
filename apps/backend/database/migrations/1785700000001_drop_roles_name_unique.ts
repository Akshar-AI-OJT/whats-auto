import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The original roles.name UNIQUE conflicted with org-scoped custom roles
 * (same name allowed per org via roles_org_name_unique). Drop the leftover
 * full unique; keep the partial indexes from the orgs migration.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_name_unique"`)
    this.schema.raw(`DROP INDEX IF EXISTS "roles_name_unique"`)
  }

  async down() {
    // Only safe to restore if no duplicate names exist across global + custom roles.
    this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_unique" ON "roles" ("name")
    `)
  }
}
