import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    /**
     *  The non-deferrable unique owner index + BEFORE UPDATE trigger
     * with a DEFERRABLE CONSTRAINT TRIGGER that asserts exactly one owner
     * at COMMIT. That allows atomic ownership transfer (promote + demote
     * in one transaction) without violating mid-statement checks.
     */
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION ensure_org_exactly_one_owner()
      RETURNS TRIGGER AS $$
      DECLARE
        org_id uuid;
        owner_count integer;
      BEGIN
        org_id := COALESCE(NEW."organizationId", OLD."organizationId");

        -- Org cascade-delete removes members after (or with) the org row.
        IF NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = org_id) THEN
          RETURN NULL;
        END IF;

        SELECT COUNT(*)::integer INTO owner_count
        FROM "organization_members"
        WHERE "organizationId" = org_id
          AND "role" = 'owner';

        IF owner_count <> 1 THEN
          RAISE EXCEPTION
            'Organization must have exactly one owner (found %)',
            owner_count;
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `)
    await this.db.rawQuery(`
      CREATE CONSTRAINT TRIGGER trg_ensure_org_exactly_one_owner
      AFTER INSERT OR UPDATE OR DELETE ON "organization_members"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ensure_org_exactly_one_owner();
    `)
  }

  async down() {
    await this.db.rawQuery(
      `DROP TRIGGER IF EXISTS trg_ensure_org_exactly_one_owner ON "organization_members"`
    )
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS ensure_org_exactly_one_owner()`)
  }
}
