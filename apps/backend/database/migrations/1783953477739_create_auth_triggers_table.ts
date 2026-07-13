import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_triggers'

  async up() {
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION handle_user_deactivation()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (NEW."isActive" = FALSE OR NEW."isDeleted" = TRUE)
             AND (
                  OLD."isActive" IS DISTINCT FROM NEW."isActive"
                  OR
                  OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
             ) THEN

              DELETE FROM "sessions"
              WHERE "userId" = NEW."id";

          END IF;

          IF NEW."isDeleted" = TRUE
             AND OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
          THEN
              DELETE FROM "accounts"
              WHERE "userId" = NEW."id";
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      `)
    await this.db.rawQuery(`
        CREATE TRIGGER trg_user_deactivation
        AFTER UPDATE ON "users"
        FOR EACH ROW
        EXECUTE FUNCTION handle_user_deactivation();
      `)
    await this.db.rawQuery(`
        CREATE OR REPLACE FUNCTION block_session_for_inactive_user()
        RETURNS TRIGGER AS $$
        DECLARE
            v_active BOOLEAN;
            v_deleted BOOLEAN;
        BEGIN
            SELECT "isActive", "isDeleted"
            INTO v_active, v_deleted
            FROM "users"
            WHERE "id" = NEW."userId";
  
            IF v_deleted THEN
                RAISE EXCEPTION
                    'Cannot create session for deleted user (%)',
                    NEW."userId";
            END IF;
  
            IF NOT v_active THEN
                RAISE EXCEPTION
                    'Cannot create session for inactive user (%)',
                    NEW."userId";
            END IF;
  
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `)
    await this.db.rawQuery(`
        CREATE TRIGGER trg_block_inactive_login
        BEFORE INSERT ON "sessions"
        FOR EACH ROW
        EXECUTE FUNCTION block_session_for_inactive_user();
      `)
  }

  async down() {
    await this.db.rawQuery(`
      DROP TRIGGER IF EXISTS trg_block_inactive_login ON "sessions";
    `)

    await this.db.rawQuery(`
      DROP FUNCTION IF EXISTS block_session_for_inactive_user();
    `)

    await this.db.rawQuery(`
      DROP TRIGGER IF EXISTS trg_user_deactivation ON "users";
    `)

    await this.db.rawQuery(`
      DROP FUNCTION IF EXISTS handle_user_deactivation();
    `)
  }
}
