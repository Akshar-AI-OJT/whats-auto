import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Shared set_updated_at() + manual opt-in triggers on selected tables.
 */
export default class extends BaseSchema {
  private readonly tables = [
    'users',
    'accounts',
    'sessions',
    'verifications',
    'organization_roles',
    'contacts',
  ] as const

  async up() {
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    for (const tableName of this.tables) {
      await this.db.rawQuery(`
        CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `)
    }
  }

  async down() {
    for (const tableName of this.tables) {
      await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "${tableName}"`)
    }
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS set_updated_at()`)
  }
}
