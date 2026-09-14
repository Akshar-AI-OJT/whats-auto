import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Owner/superadmin role_permissions are immutable at the DB layer.
 * Only the RBAC seeder may mutate them, via transaction-local:
 *   SELECT set_config('app.allow_immutable_role_permission_sync', 'on', true)
 *
 * Also blocks rename/delete/re-scope of those global role rows (same GUC).
 * organization_role_permissions overrides for owner/superadmin remain blocked
 * by trg_reject_immutable_role_permission_overrides (1784891669149).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION reject_immutable_role_permission_mutations()
      RETURNS TRIGGER AS $$
      DECLARE
        role_name text;
        role_id uuid;
        allow_sync text;
      BEGIN
        allow_sync := current_setting('app.allow_immutable_role_permission_sync', true);
        IF allow_sync = 'on' THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END IF;

        role_id := COALESCE(NEW."roleId", OLD."roleId");
        SELECT r."name" INTO role_name
        FROM "roles" r
        WHERE r."id" = role_id;

        IF role_name IN ('owner', 'superadmin') THEN
          RAISE EXCEPTION
            'Cannot mutate role_permissions for immutable role "%" (roleId=%)',
            role_name, role_id;
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_reject_immutable_role_permission_mutations
      BEFORE INSERT OR UPDATE OR DELETE ON "role_permissions"
      FOR EACH ROW
      EXECUTE FUNCTION reject_immutable_role_permission_mutations();
    `)

    this.schema.raw(`
      CREATE OR REPLACE FUNCTION reject_immutable_system_role_mutations()
      RETURNS TRIGGER AS $$
      DECLARE
        allow_sync text;
      BEGIN
        allow_sync := current_setting('app.allow_immutable_role_permission_sync', true);

        IF TG_OP = 'DELETE' THEN
          IF OLD."organizationId" IS NULL AND OLD."name" IN ('owner', 'superadmin') THEN
            IF allow_sync IS DISTINCT FROM 'on' THEN
              RAISE EXCEPTION
                'Cannot delete immutable system role "%" (id=%)',
                OLD."name", OLD."id";
            END IF;
          END IF;
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE'
           AND OLD."organizationId" IS NULL
           AND OLD."name" IN ('owner', 'superadmin') THEN
          IF NEW."name" IS DISTINCT FROM OLD."name"
             OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
            IF allow_sync IS DISTINCT FROM 'on' THEN
              RAISE EXCEPTION
                'Cannot rename or re-scope immutable system role "%" (id=%)',
                OLD."name", OLD."id";
            END IF;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_reject_immutable_system_role_mutations
      BEFORE UPDATE OR DELETE ON "roles"
      FOR EACH ROW
      EXECUTE FUNCTION reject_immutable_system_role_mutations();
    `)
  }

  async down() {
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_reject_immutable_system_role_mutations ON "roles"`)
    this.schema.raw(`DROP FUNCTION IF EXISTS reject_immutable_system_role_mutations()`)
    this.schema.raw(
      `DROP TRIGGER IF EXISTS trg_reject_immutable_role_permission_mutations ON "role_permissions"`
    )
    this.schema.raw(`DROP FUNCTION IF EXISTS reject_immutable_role_permission_mutations()`)
  }
}
